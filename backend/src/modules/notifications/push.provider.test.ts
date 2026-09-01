import { describe, expect, it } from "vitest";
import webPush from "web-push";

import { PreparedPushNotificationProvider, WebPushNotificationProvider, createPushNotificationProviderFromEnv, resolvePushDeliveryConfig } from "./push.provider.js";
import type { PushDeliveryConfig } from "./push.provider.js";

function makeSubscription(endpoint = "https://push.example.test/1") {
  return {
    id: "subscription-1",
    userId: "user-1",
    endpoint,
    p256dh: "p256dh",
    auth: "auth",
    userAgent: null,
    failureCount: 0,
    lastFailureAt: null,
    disabledAt: null,
    createdAt: new Date("2026-05-23T00:00:00.000Z"),
    updatedAt: new Date("2026-05-23T00:00:00.000Z")
  };
}

const notification = {
  id: "notification-1",
  title: "Notice",
  message: "Message",
  category: "GENERAL" as const,
  readAt: null,
  createdAt: "2026-05-23T00:00:00.000Z"
};

function readyConfig(maxAttempts = 1): PushDeliveryConfig {
  return {
    enabled: true,
    provider: "WEB_PUSH",
    status: "ready",
    maxAttempts,
    activeKeyLabel: "active",
    nextKeyReady: false,
    vapidPublicKey: "public-key",
    vapidPrivateKey: "private-key",
    vapidSubject: "mailto:admin@example.com"
  };
}

function staleError() {
  const error = new Error("Gone") as Error & { statusCode: number };
  error.statusCode = 410;
  return error;
}

describe("resolvePushDeliveryConfig", () => {
  it("defaults to disabled push delivery", () => {
    expect(resolvePushDeliveryConfig({})).toEqual({
      enabled: false,
      provider: "DISABLED",
      status: "disabled",
      maxAttempts: 1,
      activeKeyLabel: "disabled",
      nextKeyReady: false
    });
  });

  it("keeps the existing prepared provider as a dry-run boundary", () => {
    expect(
      resolvePushDeliveryConfig({
        PUSH_DELIVERY_PROVIDER: "prepared"
      })
    ).toEqual({
      enabled: true,
      provider: "PREPARED",
      status: "prepared",
      maxAttempts: 1,
      activeKeyLabel: "prepared",
      nextKeyReady: false
    });
  });

  it("reports missing credentials for future web push delivery", () => {
    expect(
      resolvePushDeliveryConfig({
        PUSH_DELIVERY_PROVIDER: "web-push",
        PUSH_VAPID_PUBLIC_KEY: "public-key"
      })
    ).toEqual({
      enabled: true,
      provider: "WEB_PUSH",
      status: "missing-credentials",
      maxAttempts: 3,
      activeKeyLabel: "active",
      nextKeyReady: false,
      vapidPublicKey: "public-key",
      vapidPrivateKey: undefined,
      vapidSubject: undefined
    });
  });

  it("reports ready web push configuration when VAPID credentials are present", () => {
    expect(
      resolvePushDeliveryConfig({
        PUSH_DELIVERY_PROVIDER: "web-push",
        PUSH_VAPID_PUBLIC_KEY: " public-key ",
        PUSH_VAPID_PRIVATE_KEY: "private-key",
        PUSH_VAPID_SUBJECT: "mailto:admin@example.com",
        PUSH_DELIVERY_MAX_ATTEMPTS: "2",
        PUSH_VAPID_KEY_LABEL: "may-2026",
        PUSH_NEXT_VAPID_PUBLIC_KEY: "next-public",
        PUSH_NEXT_VAPID_PRIVATE_KEY: "next-private",
        PUSH_NEXT_VAPID_SUBJECT: "mailto:next-admin@example.com",
        PUSH_VAPID_ROTATION_STARTED_AT: "2026-05-24T00:00:00.000Z"
      })
    ).toEqual({
      enabled: true,
      provider: "WEB_PUSH",
      status: "ready",
      maxAttempts: 2,
      activeKeyLabel: "may-2026",
      nextKeyReady: true,
      rotationStartedAt: "2026-05-24T00:00:00.000Z",
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
      vapidSubject: "mailto:admin@example.com",
      nextVapidPublicKey: "next-public"
    });
  });
});

describe("PreparedPushNotificationProvider", () => {
  it("does not attempt delivery when future web push credentials are incomplete", async () => {
    const provider = new PreparedPushNotificationProvider({
      enabled: true,
      provider: "WEB_PUSH",
      status: "missing-credentials",
      maxAttempts: 1,
      activeKeyLabel: "active",
      nextKeyReady: false
    });

    await expect(
      provider.sendToSubscriptions({
        notification,
        subscriptions: [makeSubscription()]
      })
    ).resolves.toEqual({
      attempted: false,
      failures: []
    });
  });
});

describe("WebPushNotificationProvider", () => {
  it("sends notification payloads through the web-push sender", async () => {
    const sentPayloads: string[] = [];
    const provider = new WebPushNotificationProvider(
      readyConfig(),
      {
        setVapidDetails(subject, publicKey, privateKey) {
          expect({ subject, publicKey, privateKey }).toEqual({
            subject: "mailto:admin@example.com",
            publicKey: "public-key",
            privateKey: "private-key"
          });
        },
        async sendNotification(subscription, body) {
          expect(subscription).toEqual({
            endpoint: "https://push.example.test/1",
            keys: {
              p256dh: "p256dh",
              auth: "auth"
            }
          });
          sentPayloads.push(body);
        }
      }
    );

    await expect(
      provider.sendToSubscriptions({
        notification,
        subscriptions: [makeSubscription()]
      })
    ).resolves.toEqual({
      attempted: true,
      failures: []
    });
    expect(JSON.parse(sentPayloads[0]!)).toMatchObject({
      title: "Notice",
      body: "Message",
      category: "GENERAL",
      notificationId: "notification-1",
      url: "/notifications"
    });
  });

  it("reports stale failures for gone browser subscriptions", async () => {
    const provider = new WebPushNotificationProvider(
      readyConfig(3),
      {
        setVapidDetails() {},
        async sendNotification() {
          throw staleError();
        }
      }
    );

    await expect(
      provider.sendToSubscriptions({
        notification,
        subscriptions: [makeSubscription("https://push.example.test/stale")]
      })
    ).resolves.toEqual({
      attempted: true,
      failures: [
        {
          endpoint: "https://push.example.test/stale",
          stale: true,
          reason: "Gone"
        }
      ]
    });
  });

  it("retries transient failures before reporting success", async () => {
    let attempts = 0;
    const provider = new WebPushNotificationProvider(
      readyConfig(3),
      {
        setVapidDetails() {},
        async sendNotification() {
          attempts += 1;

          if (attempts < 2) {
            throw new Error("temporary network failure");
          }
        }
      }
    );

    await expect(
      provider.sendToSubscriptions({
        notification,
        subscriptions: [makeSubscription()]
      })
    ).resolves.toEqual({
      attempted: true,
      failures: []
    });
    expect(attempts).toBe(2);
  });

  it("does not retry stale browser subscriptions", async () => {
    let attempts = 0;
    const provider = new WebPushNotificationProvider(
      readyConfig(3),
      {
        setVapidDetails() {},
        async sendNotification() {
          attempts += 1;
          throw staleError();
        }
      }
    );

    await provider.sendToSubscriptions({
      notification,
      subscriptions: [makeSubscription("https://push.example.test/stale")]
    });

    expect(attempts).toBe(1);
  });

  it("uses the real web-push provider when credentials are ready", () => {
    const keys = webPush.generateVAPIDKeys();

    expect(
      createPushNotificationProviderFromEnv({
        PUSH_DELIVERY_PROVIDER: "web-push",
        PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
        PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
        PUSH_VAPID_SUBJECT: "mailto:admin@example.com"
      })
    ).toBeInstanceOf(WebPushNotificationProvider);
  });
});
