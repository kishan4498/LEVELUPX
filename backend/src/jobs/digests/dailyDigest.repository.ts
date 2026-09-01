import { QuestStatus, UserStatus } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type DailyDigestCandidate = {
  preferenceId: string;
  userId: string;
  name: string;
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  lastDailyDigestAt: Date | null;
  quests: { dueDate: Date | null }[];
  focusSessions: { startTime: Date; durationMinutes: number | null }[];
};

export interface IDailyDigestRepository {
  findCandidates(now: Date, limit: number): Promise<DailyDigestCandidate[]>;
  claimDelivery(preferenceId: string, previousDelivery: Date | null, deliveredAt: Date): Promise<boolean>;
}

export class PrismaDailyDigestRepository implements IDailyDigestRepository {
  async findCandidates(now: Date, limit: number) {
    const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const prefs = await prisma.userNotificationPreference.findMany({
      where: {
        dailyDigest: true,
        inAppEnabled: true,
        user: { status: UserStatus.ACTIVE }
      },
      select: {
        id: true,
        userId: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        lastDailyDigestAt: true,
        user: {
          select: {
            name: true,
            profile: { select: { timezone: true } },
            quests: {
              where: { status: { in: [QuestStatus.PENDING, QuestStatus.IN_PROGRESS] } },
              select: { dueDate: true }
            },
            focusSessions: {
              where: { completed: true, startTime: { gte: since } },
              select: { startTime: true, durationMinutes: true }
            }
          }
        }
      },
      orderBy: { updatedAt: "asc" },
      take: limit
    });

    return prefs.map((pref) => ({
      preferenceId: pref.id,
      userId: pref.userId,
      name: pref.user.name,
      timezone: pref.user.profile?.timezone ?? "UTC",
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      lastDailyDigestAt: pref.lastDailyDigestAt,
      quests: pref.user.quests,
      focusSessions: pref.user.focusSessions
    }));
  }

  async claimDelivery(preferenceId: string, previousDelivery: Date | null, deliveredAt: Date) {
    const updated = await prisma.userNotificationPreference.updateMany({
      where: {
        id: preferenceId,
        lastDailyDigestAt: previousDelivery
      },
      data: { lastDailyDigestAt: deliveredAt }
    });

    return updated.count === 1;
  }
}
