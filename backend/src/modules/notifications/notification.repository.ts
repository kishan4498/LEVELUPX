import type { Notification, UserNotificationPreference, UserPushSubscription } from "@prisma/client";

import { prisma } from "../../prisma/client.js";
import type {
  CreateNotificationInput,
  PushSubscriptionInput,
  PushSubscriptionRemovalInput,
  UpdateNotificationPreferencesInput
} from "./notification.types.js";

export interface INotificationRepository {
  create(notification: CreateNotificationInput): Promise<Notification>;
  findForUser(userId: string): Promise<Notification[]>;
  countUnreadForUser(userId: string): Promise<number>;
  findById(id: string): Promise<Notification | null>;
  markAsRead(id: string): Promise<Notification>;
  findPreferences(userId: string): Promise<UserNotificationPreference | null>;
  upsertPreferences(userId: string, prefs: UpdateNotificationPreferencesInput): Promise<UserNotificationPreference>;
  upsertPushSubscription(
    userId: string,
    subscription: PushSubscriptionInput,
    userAgent?: string
  ): Promise<UserPushSubscription>;
  findPushSubscriptionsForUser(userId: string): Promise<UserPushSubscription[]>;
  findActivePushSubscriptionsForUser(userId: string): Promise<UserPushSubscription[]>;
  disablePushSubscription(userId: string, removal: PushSubscriptionRemovalInput): Promise<UserPushSubscription | null>;
  recordPushSubscriptionFailure(id: string, disable: boolean): Promise<UserPushSubscription>;
}

export class PrismaNotificationRepository implements INotificationRepository {
  create(notification: CreateNotificationInput) {
    return prisma.notification.create({
      data: notification
    });
  }

  findForUser(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  countUnreadForUser(userId: string) {
    return prisma.notification.count({
      where: {
        userId,
        readAt: null
      }
    });
  }

  findById(id: string) {
    return prisma.notification.findUnique({
      where: { id }
    });
  }

  markAsRead(id: string) {
    return prisma.notification.update({
      where: { id },
      data: { readAt: new Date() }
    });
  }

  findPreferences(userId: string) {
    return prisma.userNotificationPreference.findUnique({
      where: { userId }
    });
  }

  upsertPreferences(userId: string, prefs: UpdateNotificationPreferencesInput) {
    return prisma.userNotificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...prefs
      },
      update: prefs
    });
  }

  upsertPushSubscription(userId: string, subscription: PushSubscriptionInput, userAgent?: string) {
    return prisma.userPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent
      },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        failureCount: 0,
        lastFailureAt: null,
        disabledAt: null
      }
    });
  }

  findPushSubscriptionsForUser(userId: string) {
    return prisma.userPushSubscription.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 10
    });
  }

  findActivePushSubscriptionsForUser(userId: string) {
    return prisma.userPushSubscription.findMany({
      where: {
        userId,
        disabledAt: null
      },
      orderBy: { updatedAt: "desc" },
      take: 10
    });
  }

  async disablePushSubscription(userId: string, removal: PushSubscriptionRemovalInput) {
    const subscription = await prisma.userPushSubscription.findFirst({
      where: {
        userId,
        endpoint: removal.endpoint
      }
    });

    if (!subscription) {
      return null;
    }

    return prisma.userPushSubscription.update({
      where: { id: subscription.id },
      data: { disabledAt: new Date() }
    });
  }

  recordPushSubscriptionFailure(id: string, disable: boolean) {
    return prisma.userPushSubscription.update({
      where: { id },
      data: {
        failureCount: { increment: 1 },
        lastFailureAt: new Date(),
        ...(disable ? { disabledAt: new Date() } : {})
      }
    });
  }
}
