import type { Notification, UserNotificationPreference, UserPushSubscription } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { INotificationRepository } from "./notification.repository.js";
import { NotificationService } from "./notification.service.js";
import type { UpdateNotificationPreferencesInput } from "./notification.types.js";

function makeNotification(seed: {
  userId: string;
  title?: string;
  message?: string;
  category?: string;
}): Notification {
  return {
    id: "notification-1",
    userId: seed.userId,
    title: seed.title ?? "Notice",
    message: seed.message ?? "Message",
    category: seed.category ?? "GENERAL",
    readAt: null,
    createdAt: new Date("2026-05-22T01:30:00.000Z")
  };
}

function makePreferences(
  userId: string,
  patch: UpdateNotificationPreferencesInput = {}
): UserNotificationPreference {
  return {
    id: `${userId}-preferences`,
    userId,
    inAppEnabled: patch.inAppEnabled ?? true,
    rewardNotifications: patch.rewardNotifications ?? true,
    achievementNotifications: patch.achievementNotifications ?? true,
    insightNotifications: patch.insightNotifications ?? true,
    guildNotifications: patch.guildNotifications ?? true,
    pushNotifications: patch.pushNotifications ?? false,
    questReminders: patch.questReminders ?? true,
    dailyDigest: patch.dailyDigest ?? false,
    quietHoursStart: patch.quietHoursStart ?? null,
    quietHoursEnd: patch.quietHoursEnd ?? null,
    lastDailyDigestAt: null,
    updatedAt: new Date("2026-05-22T01:00:00.000Z"),
    createdAt: new Date("2026-05-22T00:00:00.000Z")
  };
}

function makePushSubscription(seed: {
  userId: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  userAgent?: string;
}): UserPushSubscription {
  return {
    id: "push-subscription-1",
    userId: seed.userId,
    endpoint: seed.endpoint ?? "https://push.example.test/subscription-1",
    p256dh: seed.p256dh ?? "p256dh-key",
    auth: seed.auth ?? "auth-key",
    userAgent: seed.userAgent ?? "test-browser",
    failureCount: 0,
    lastFailureAt: null,
    disabledAt: null,
    createdAt: new Date("2026-05-22T02:00:00.000Z"),
    updatedAt: new Date("2026-05-22T02:05:00.000Z")
  };
}

function repository(overrides: Partial<INotificationRepository>): INotificationRepository {
  return {
    async create(): Promise<Notification> {
      throw new Error("not implemented");
    },
    async findForUser() {
      return [];
    },
    async countUnreadForUser() {
      return 0;
    },
    async findById() {
      return null;
    },
    async markAsRead(): Promise<Notification> {
      throw new Error("not implemented");
    },
    async findPreferences() {
      return null;
    },
    async upsertPreferences(userId, prefs) {
      return makePreferences(userId, prefs);
    },
    async upsertPushSubscription(userId, subscription, userAgent) {
      return makePushSubscription({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent
      });
    },
    async findPushSubscriptionsForUser() {
      return [];
    },
    async findActivePushSubscriptionsForUser() {
      return [];
    },
    async disablePushSubscription(userId, removal) {
      return makePushSubscription({ userId, endpoint: removal.endpoint });
    },
    async recordPushSubscriptionFailure(id) {
      return makePushSubscription({ userId: "user-1", endpoint: id });
    },
    ...overrides
  };
}

describe("NotificationService preferences", () => {
  it("creates default preferences when none exist", async () => {
    const service = new NotificationService(repository({}));

    await expect(service.fetchNotificationSettings("user-1")).resolves.toMatchObject({
      inAppEnabled: true,
      rewardNotifications: true,
      achievementNotifications: true,
      insightNotifications: true,
      guildNotifications: true,
      pushNotifications: false,
      updatedAt: "2026-05-22T01:00:00.000Z"
    });
  });

  it("updates selected preference switches", async () => {
    let saved: UpdateNotificationPreferencesInput | null = null;
    const service = new NotificationService(
      repository({
        async upsertPreferences(userId, prefs) {
          saved = prefs;
          return makePreferences(userId, prefs);
        }
      })
    );

    const preferences = await service.tweakNotificationSettings("user-1", {
      rewardNotifications: false,
      guildNotifications: false
    });

    expect(saved).toEqual({
      rewardNotifications: false,
      guildNotifications: false
    });
    expect(preferences).toMatchObject({
      rewardNotifications: false,
      guildNotifications: false,
      achievementNotifications: true,
      pushNotifications: false
    });
  });

  it("returns unread notification count", async () => {
    const service = new NotificationService(
      repository({
        async countUnreadForUser(userId) {
          expect(userId).toBe("user-1");
          return 3;
        }
      })
    );

    await expect(service.fetchUnreadCount("user-1")).resolves.toEqual({ unreadCount: 3 });
  });

  it("creates enabled category notifications", async () => {
    let category: string | undefined;
    const service = new NotificationService(
      repository({
        async create(notice) {
          category = notice.category;
          return makeNotification(notice);
        }
      })
    );

    const notification = await service.dispatchNotification({
      userId: "user-1",
      title: "Quest completed",
      message: "Reward earned.",
      category: "REWARD"
    });

    expect(category).toBe("REWARD");
    expect(notification).toMatchObject({
      category: "REWARD"
    });
  });

  it("delivers push through the configured provider when push is enabled", async () => {
    let sentCount = 0;
    const service = new NotificationService(
      repository({
        async findPreferences(userId) {
          return makePreferences(userId, { pushNotifications: true });
        },
        async create(notice) {
          return makeNotification(notice);
        },
        async findActivePushSubscriptionsForUser(userId) {
          return [makePushSubscription({ userId })];
        }
      }),
      {
        async sendToSubscriptions(delivery) {
          sentCount = delivery.subscriptions.length;
          return {
            attempted: true,
            failures: []
          };
        }
      }
    );

    await service.dispatchNotification({
      userId: "user-1",
      title: "Quest completed",
      message: "Reward earned.",
      category: "REWARD"
    });

    expect(sentCount).toBe(1);
  });

  it("marks stale push subscriptions when the provider reports a stale failure", async () => {
    let failedId: string | null = null;
    let disabled = false;
    const stale = makePushSubscription({
      userId: "user-1",
      endpoint: "https://push.example.test/stale"
    });
    const service = new NotificationService(
      repository({
        async findPreferences(userId) {
          return makePreferences(userId, { pushNotifications: true });
        },
        async create(notice) {
          return makeNotification(notice);
        },
        async findActivePushSubscriptionsForUser() {
          return [stale];
        },
        async recordPushSubscriptionFailure(id, shouldDisable) {
          failedId = id;
          disabled = shouldDisable;
          return {
            ...stale,
            failureCount: 1,
            lastFailureAt: new Date("2026-05-22T02:10:00.000Z"),
            disabledAt: shouldDisable ? new Date("2026-05-22T02:10:00.000Z") : null
          };
        }
      }),
      {
        async sendToSubscriptions() {
          return {
            attempted: true,
            failures: [
              {
                endpoint: stale.endpoint,
                stale: true,
                reason: "gone"
              }
            ]
          };
        }
      }
    );

    await service.dispatchNotification({
      userId: "user-1",
      title: "Quest completed",
      message: "Reward earned.",
      category: "REWARD"
    });

    expect(failedId).toBe(stale.id);
    expect(disabled).toBe(true);
  });

  it("suppresses disabled category notifications", async () => {
    let createCalled = false;
    const service = new NotificationService(
      repository({
        async findPreferences(userId) {
          return makePreferences(userId, { rewardNotifications: false });
        },
        async create(notice) {
          createCalled = true;
          return makeNotification(notice);
        }
      })
    );

    const notification = await service.dispatchNotification({
      userId: "user-1",
      title: "Quest completed",
      message: "Reward earned.",
      category: "REWARD"
    });

    expect(notification).toBeNull();
    expect(createCalled).toBe(false);
  });

  it("stores a push subscription and enables push preferences", async () => {
    let savedPrefs: UpdateNotificationPreferencesInput | null = null;
    let savedAgent: string | undefined;
    const service = new NotificationService(
      repository({
        async upsertPreferences(userId, prefs) {
          savedPrefs = prefs;
          return makePreferences(userId, prefs);
        },
        async upsertPushSubscription(userId, pushSubscription, userAgent) {
          savedAgent = userAgent;
          return makePushSubscription({
            userId,
            endpoint: pushSubscription.endpoint,
            p256dh: pushSubscription.keys.p256dh,
            auth: pushSubscription.keys.auth,
            userAgent
          });
        }
      })
    );

    const subscription = await service.registerDeviceForPush(
      "user-1",
      {
        endpoint: "https://push.example.test/subscription-2",
        keys: {
          p256dh: "stored-p256dh-key",
          auth: "stored-auth-key"
        }
      },
      "test-browser"
    );

    expect(savedAgent).toBe("test-browser");
    expect(savedPrefs).toEqual({ pushNotifications: true });
    expect(subscription).toMatchObject({
      endpoint: "https://push.example.test/subscription-2",
      failureCount: 0,
      lastFailureAt: null,
      disabledAt: null,
      updatedAt: "2026-05-22T02:05:00.000Z"
    });
  });

  it("lists push subscription lifecycle metadata", async () => {
    const active = makePushSubscription({
      userId: "user-1",
      endpoint: "https://push.example.test/active"
    });
    const failed: UserPushSubscription = {
      ...makePushSubscription({
        userId: "user-1",
        endpoint: "https://push.example.test/failed"
      }),
      id: "push-subscription-2",
      failureCount: 2,
      lastFailureAt: new Date("2026-05-22T03:00:00.000Z"),
      disabledAt: new Date("2026-05-22T03:05:00.000Z")
    };
    const service = new NotificationService(
      repository({
        async findPushSubscriptionsForUser(userId) {
          expect(userId).toBe("user-1");
          return [active, failed];
        }
      })
    );

    await expect(service.fetchRegisteredDevices("user-1")).resolves.toEqual([
      {
        id: "push-subscription-1",
        endpoint: "https://push.example.test/active",
        userAgent: "test-browser",
        failureCount: 0,
        lastFailureAt: null,
        disabledAt: null,
        createdAt: "2026-05-22T02:00:00.000Z",
        updatedAt: "2026-05-22T02:05:00.000Z"
      },
      {
        id: "push-subscription-2",
        endpoint: "https://push.example.test/failed",
        userAgent: "test-browser",
        failureCount: 2,
        lastFailureAt: "2026-05-22T03:00:00.000Z",
        disabledAt: "2026-05-22T03:05:00.000Z",
        createdAt: "2026-05-22T02:00:00.000Z",
        updatedAt: "2026-05-22T02:05:00.000Z"
      }
    ]);
  });

  it("disables push preferences when the last push subscription is removed", async () => {
    let endpoint: string | null = null;
    let savedPrefs: UpdateNotificationPreferencesInput | null = null;
    const service = new NotificationService(
      repository({
        async disablePushSubscription(_userId, removal) {
          endpoint = removal.endpoint;
          return makePushSubscription({
            userId: "user-1",
            endpoint: removal.endpoint
          });
        },
        async findActivePushSubscriptionsForUser() {
          return [];
        },
        async upsertPreferences(userId, prefs) {
          savedPrefs = prefs;
          return makePreferences(userId, prefs);
        }
      })
    );

    const preferences = await service.unregisterDeviceForPush("user-1", {
      endpoint: "https://push.example.test/subscription-2"
    });

    expect(endpoint).toBe("https://push.example.test/subscription-2");
    expect(savedPrefs).toEqual({ pushNotifications: false });
    expect(preferences.pushNotifications).toBe(false);
  });

  it("keeps push preferences enabled when another active subscription remains", async () => {
    let savedPrefs: UpdateNotificationPreferencesInput | null = null;
    const service = new NotificationService(
      repository({
        async findPreferences(userId) {
          return makePreferences(userId, { pushNotifications: true });
        },
        async findActivePushSubscriptionsForUser(userId) {
          return [makePushSubscription({ userId, endpoint: "https://push.example.test/remaining" })];
        },
        async upsertPreferences(userId, prefs) {
          savedPrefs = prefs;
          return makePreferences(userId, prefs);
        }
      })
    );

    const preferences = await service.unregisterDeviceForPush("user-1", {
      endpoint: "https://push.example.test/subscription-2"
    });

    expect(savedPrefs).toBeNull();
    expect(preferences.pushNotifications).toBe(true);
  });
});
