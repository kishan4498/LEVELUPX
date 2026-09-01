import type { Notification, UserNotificationPreference, UserPushSubscription } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { publishRealtimeEvent } from "../../realtime/realtime.publisher.js";
import { realtimeEvents } from "../../realtime/realtime.types.js";
import type { INotificationRepository } from "./notification.repository.js";
import { DisabledPushNotificationProvider, type IPushNotificationProvider } from "./push.provider.js";
import type {
  CreateNotificationInput,
  NotificationDto,
  NotificationPreferenceDto,
  PushSubscriptionDto,
  PushSubscriptionInput,
  PushSubscriptionRemovalInput,
  NotificationUnreadCountDto,
  UpdateNotificationPreferencesInput
} from "./notification.types.js";

export class NotificationService {
  constructor(
    private readonly repo: INotificationRepository,
    private readonly pushProvider: IPushNotificationProvider = new DisabledPushNotificationProvider()
  ) {}

  async dispatchNotification(notice: CreateNotificationInput): Promise<NotificationDto | null> {
    const category = notice.category ?? "GENERAL";
    const prefs = await this.getOrCreatePreferences(notice.userId);

    if (!this.shouldCreateNotification(prefs, category)) {
      return null;
    }

    const notification = await this.repo.create({
      ...notice,
      category
    });
    await this.publishUnreadCount(notice.userId);
    const dto = this.toDto(notification);
    await this.deliverPushNotification(notice.userId, prefs, dto);
    return dto;
  }

  async fetchUserInbox(userId: string): Promise<NotificationDto[]> {
    const notifications = await this.repo.findForUser(userId);
    return notifications.map((notification) => this.toDto(notification));
  }

  async acknowledgeNotification(userId: string, notificationId: string): Promise<NotificationDto> {
    const notification = await this.repo.findById(notificationId);

    if (!notification || notification.userId !== userId) {
      throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
    }

    if (notification.readAt) {
      return this.toDto(notification);
    }

    const updated = await this.repo.markAsRead(notification.id);
    await this.publishUnreadCount(userId);
    return this.toDto(updated);
  }

  async fetchUnreadCount(userId: string): Promise<NotificationUnreadCountDto> {
    return {
      unreadCount: await this.repo.countUnreadForUser(userId)
    };
  }

  async fetchNotificationSettings(userId: string): Promise<NotificationPreferenceDto> {
    const prefs = await this.getOrCreatePreferences(userId);
    return this.toPreferenceDto(prefs);
  }

  async tweakNotificationSettings(
    userId: string,
    prefs: UpdateNotificationPreferencesInput
  ): Promise<NotificationPreferenceDto> {
    const savedPrefs = await this.repo.upsertPreferences(userId, prefs);
    return this.toPreferenceDto(savedPrefs);
  }

  async registerDeviceForPush(
    userId: string,
    subscription: PushSubscriptionInput,
    userAgent?: string
  ): Promise<PushSubscriptionDto> {
    const savedSubscription = await this.repo.upsertPushSubscription(userId, subscription, userAgent);
    await this.repo.upsertPreferences(userId, { pushNotifications: true });
    return this.toPushSubscriptionDto(savedSubscription);
  }

  async fetchRegisteredDevices(userId: string): Promise<PushSubscriptionDto[]> {
    const subscriptions = await this.repo.findPushSubscriptionsForUser(userId);
    return subscriptions.map((subscription) => this.toPushSubscriptionDto(subscription));
  }

  async unregisterDeviceForPush(
    userId: string,
    removal: PushSubscriptionRemovalInput
  ): Promise<NotificationPreferenceDto> {
    await this.repo.disablePushSubscription(userId, removal);
    const active = await this.repo.findActivePushSubscriptionsForUser(userId);

    if (active.length === 0) {
      const prefs = await this.repo.upsertPreferences(userId, { pushNotifications: false });
      return this.toPreferenceDto(prefs);
    }

    return this.fetchNotificationSettings(userId);
  }

  private toDto(notification: Notification): NotificationDto {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      category: this.toNotificationCategory(notification.category),
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString()
    };
  }

  private toPreferenceDto(preferences: UserNotificationPreference): NotificationPreferenceDto {
    return {
      inAppEnabled: preferences.inAppEnabled,
      rewardNotifications: preferences.rewardNotifications,
      achievementNotifications: preferences.achievementNotifications,
      insightNotifications: preferences.insightNotifications,
      guildNotifications: preferences.guildNotifications,
      pushNotifications: preferences.pushNotifications,
      questReminders: preferences.questReminders,
      dailyDigest: preferences.dailyDigest,
      quietHoursStart: preferences.quietHoursStart,
      quietHoursEnd: preferences.quietHoursEnd,
      updatedAt: preferences.updatedAt.toISOString()
    };
  }

  private toPushSubscriptionDto(subscription: UserPushSubscription): PushSubscriptionDto {
    return {
      id: subscription.id,
      endpoint: subscription.endpoint,
      userAgent: subscription.userAgent,
      failureCount: subscription.failureCount,
      lastFailureAt: subscription.lastFailureAt?.toISOString() ?? null,
      disabledAt: subscription.disabledAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString()
    };
  }

  private async deliverPushNotification(
    userId: string,
    preferences: UserNotificationPreference,
    notification: NotificationDto
  ) {
    if (!preferences.pushNotifications) {
      return;
    }

    const subscriptions = await this.repo.findActivePushSubscriptionsForUser(userId);

    if (subscriptions.length === 0) {
      return;
    }

    // The inbox is durable even when best-effort push delivery fails.
    const delivery = await this.pushProvider.sendToSubscriptions({
      notification,
      subscriptions
    });

    if (!delivery.attempted || delivery.failures.length === 0) {
      return;
    }

    const byEndpoint = new Map(subscriptions.map((subscription) => [subscription.endpoint, subscription]));

    await Promise.all(
      delivery.failures.map((failure) => {
        const subscription = byEndpoint.get(failure.endpoint);

        if (!subscription) {
          return;
        }

        return this.repo.recordPushSubscriptionFailure(subscription.id, failure.stale);
      })
    );
  }

  private async publishUnreadCount(userId: string) {
    const unreadCount = await this.repo.countUnreadForUser(userId);

    publishRealtimeEvent({
      name: realtimeEvents.notificationCountUpdated,
      userId,
      payload: { unreadCount }
    });
  }

  private async getOrCreatePreferences(userId: string) {
    const prefs = await this.repo.findPreferences(userId);
    return prefs ?? (await this.repo.upsertPreferences(userId, {}));
  }

  private shouldCreateNotification(preferences: UserNotificationPreference, category: CreateNotificationInput["category"]) {
    if (!preferences.inAppEnabled) {
      return false;
    }

    if (category === "REWARD") {
      return preferences.rewardNotifications;
    }

    if (category === "ACHIEVEMENT") {
      return preferences.achievementNotifications;
    }

    if (category === "INSIGHT") {
      return preferences.insightNotifications;
    }

    if (category === "GUILD") {
      return preferences.guildNotifications;
    }

    if (category === "QUEST_REMINDER") {
      return preferences.questReminders;
    }

    if (category === "DAILY_DIGEST") {
      return preferences.dailyDigest;
    }

    return true;
  }

  private toNotificationCategory(category: string): NotificationDto["category"] {
    if (
      category === "REWARD" ||
      category === "ACHIEVEMENT" ||
      category === "INSIGHT" ||
      category === "GUILD" ||
      category === "QUEST_REMINDER" ||
      category === "DAILY_DIGEST"
    ) {
      return category;
    }

    return "GENERAL";
  }
}
