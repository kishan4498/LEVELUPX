import { QuestStatus, type Prisma } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

const reminderInclude = {
  user: {
    select: {
      profile: {
        select: { timezone: true }
      },
      notificationPreference: {
        select: {
          questReminders: true,
          quietHoursStart: true,
          quietHoursEnd: true
        }
      }
    }
  }
} satisfies Prisma.QuestInclude;

export type DueQuestReminder = Prisma.QuestGetPayload<{
  include: typeof reminderInclude;
}>;

export interface IQuestReminderRepository {
  findDue(now: Date, limit: number): Promise<DueQuestReminder[]>;
  markSent(questId: string, sentAt: Date): Promise<void>;
}

export class PrismaQuestReminderRepository implements IQuestReminderRepository {
  findDue(now: Date, limit: number) {
    return prisma.quest.findMany({
      where: {
        reminderAt: { lte: now },
        reminderSentAt: null,
        status: { in: [QuestStatus.PENDING, QuestStatus.IN_PROGRESS] }
      },
      include: reminderInclude,
      orderBy: { reminderAt: "asc" },
      take: limit
    });
  }

  async markSent(questId: string, sentAt: Date) {
    await prisma.quest.updateMany({
      where: { id: questId, reminderSentAt: null },
      data: { reminderSentAt: sentAt }
    });
  }
}
