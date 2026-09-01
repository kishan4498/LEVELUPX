import type { UserPushSubscription } from "@prisma/client";
import webPush from "web-push";

import type { NotificationDto } from "./notification.types.js";

export type PushDeliveryFailure = {
  endpoint: string;
  stale: boolean;
  reason: string;
};

export type PushDeliveryResult = {
  attempted: boolean;
  failures: PushDeliveryFailure[];
};

export type PushDeliveryProviderName = "DISABLED" | "PREPARED" | "WEB_PUSH";
export type PushDeliveryStatus = "disabled" | "prepared" | "missing-credentials" | "ready";

export type PushDeliveryConfig = {
  enabled: boolean;
  provider: PushDeliveryProviderName;
  status: PushDeliveryStatus;
  maxAttempts: number;
  activeKeyLabel: string;
  nextKeyReady: boolean;
  rotationStartedAt?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  nextVapidPublicKey?: string;
};

export interface IPushNotificationProvider {
  sendToSubscriptions(delivery: {
    notification: NotificationDto;
    subscriptions: UserPushSubscription[];
  }): Promise<PushDeliveryResult>;
}

type WebPushSender = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    body: string
  ): Promise<unknown>;
};

export class DisabledPushNotificationProvider implements IPushNotificationProvider {
  async sendToSubscriptions(): Promise<PushDeliveryResult> {
    return {
      attempted: false,
      failures: []
    };
  }
}

export class PreparedPushNotificationProvider implements IPushNotificationProvider {
  constructor(
    private readonly deliveryCfg: PushDeliveryConfig = resolvePushDeliveryConfig({
      PUSH_DELIVERY_PROVIDER: "prepared"
    })
  ) {}

  async sendToSubscriptions(delivery: {
    notification: NotificationDto;
    subscriptions: UserPushSubscription[];
  }): Promise<PushDeliveryResult> {
    return {
      attempted: delivery.subscriptions.length > 0 && this.deliveryCfg.status !== "missing-credentials",
      failures: []
    };
  }
}

export class WebPushNotificationProvider implements IPushNotificationProvider {
  constructor(
    private readonly deliveryCfg: PushDeliveryConfig,
    private readonly sender: WebPushSender = webPush
  ) {
    if (
      deliveryCfg.status === "ready" &&
      deliveryCfg.vapidSubject &&
      deliveryCfg.vapidPublicKey &&
      deliveryCfg.vapidPrivateKey
    ) {
      this.sender.setVapidDetails(deliveryCfg.vapidSubject, deliveryCfg.vapidPublicKey, deliveryCfg.vapidPrivateKey);
    }
  }

  async sendToSubscriptions(delivery: {
    notification: NotificationDto;
    subscriptions: UserPushSubscription[];
  }): Promise<PushDeliveryResult> {
    if (this.deliveryCfg.status !== "ready" || delivery.subscriptions.length === 0) {
      return {
        attempted: false,
        failures: []
      };
    }

    const body = JSON.stringify({
      title: delivery.notification.title,
      body: delivery.notification.message,
      category: delivery.notification.category,
      notificationId: delivery.notification.id,
      createdAt: delivery.notification.createdAt,
      url: "/notifications"
    });
    const failures: PushDeliveryFailure[] = [];

    await Promise.all(delivery.subscriptions.map((subscription) => this.sendWithRetry(subscription, body, failures)));

    return {
      attempted: true,
      failures
    };
  }

  private async sendWithRetry(
    subscription: UserPushSubscription,
    body: string,
    failures: PushDeliveryFailure[]
  ) {
    const maxAttempts = Math.max(1, this.deliveryCfg.maxAttempts);
    let lastError: (Error & { statusCode?: number; body?: string }) | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const outcome = await this.trySend(subscription, body);

      if (outcome.sent) {
        return;
      }

      lastError = outcome.error;
      if (this.isStaleFailure(lastError)) {
        break;
      }
    }

    failures.push({
      endpoint: subscription.endpoint,
      stale: lastError ? this.isStaleFailure(lastError) : false,
      reason: lastError?.message || lastError?.body || "Web push delivery failed"
    });
  }

  private async trySend(
    subscription: UserPushSubscription,
    body: string
  ): Promise<
    | { sent: true }
    | { sent: false; error: Error & { statusCode?: number; body?: string } }
  > {
    try {
      await this.sender.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        body
      );
      return { sent: true };
    } catch (error) {
      return {
        sent: false,
        error: error as Error & { statusCode?: number; body?: string }
      };
    }
  }

  private isStaleFailure(error: { statusCode?: number }) {
    return error.statusCode === 404 || error.statusCode === 410;
  }
}

export function resolvePushDeliveryConfig(env: NodeJS.ProcessEnv = process.env): PushDeliveryConfig {
  const provider = env.PUSH_DELIVERY_PROVIDER;

  if (provider === "prepared") {
    return {
      enabled: true,
      provider: "PREPARED",
      status: "prepared",
      maxAttempts: 1,
      activeKeyLabel: "prepared",
      nextKeyReady: false
    };
  }

  if (provider === "web-push") {
    const vapidPublicKey = trimOptional(env.PUSH_VAPID_PUBLIC_KEY);
    const vapidPrivateKey = trimOptional(env.PUSH_VAPID_PRIVATE_KEY);
    const vapidSubject = trimOptional(env.PUSH_VAPID_SUBJECT);
    const nextVapidPublicKey = trimOptional(env.PUSH_NEXT_VAPID_PUBLIC_KEY);
    const nextVapidPrivateKey = trimOptional(env.PUSH_NEXT_VAPID_PRIVATE_KEY);
    const nextVapidSubject = trimOptional(env.PUSH_NEXT_VAPID_SUBJECT);
    const activeKeyLabel = trimOptional(env.PUSH_VAPID_KEY_LABEL) ?? "active";

    return {
      enabled: true,
      provider: "WEB_PUSH",
      status: vapidPublicKey && vapidPrivateKey && vapidSubject ? "ready" : "missing-credentials",
      maxAttempts: readPositiveInt(env.PUSH_DELIVERY_MAX_ATTEMPTS) ?? 3,
      activeKeyLabel,
      nextKeyReady: Boolean(nextVapidPublicKey && nextVapidPrivateKey && nextVapidSubject),
      rotationStartedAt: trimOptional(env.PUSH_VAPID_ROTATION_STARTED_AT),
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject,
      nextVapidPublicKey
    };
  }

  return {
    enabled: false,
    provider: "DISABLED",
    status: "disabled",
    maxAttempts: 1,
    activeKeyLabel: "disabled",
    nextKeyReady: false
  };
}

export function createPushNotificationProviderFromEnv(env: NodeJS.ProcessEnv = process.env): IPushNotificationProvider {
  const deliveryCfg = resolvePushDeliveryConfig(env);

  if (deliveryCfg.provider === "WEB_PUSH" && deliveryCfg.status === "ready") {
    return new WebPushNotificationProvider(deliveryCfg);
  }

  if (deliveryCfg.provider === "PREPARED" || deliveryCfg.provider === "WEB_PUSH") {
    return new PreparedPushNotificationProvider(deliveryCfg);
  }

  return new DisabledPushNotificationProvider();
}

function trimOptional(raw: string | undefined) {
  return raw?.trim() || undefined;
}

function readPositiveInt(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
