import { QuestStatus, type FocusSession, type Quest, type XpTransaction } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type AnalyticsWindow = {
  userId: string;
  from: Date;
  to: Date;
};

export interface IAnalyticsRepository {
  findQuestsInWindow(window: AnalyticsWindow): Promise<Quest[]>;
  findXpTransactionsInWindow(window: AnalyticsWindow): Promise<XpTransaction[]>;
  findFocusSessionsInWindow(window: AnalyticsWindow): Promise<FocusSession[]>;
}

export class PrismaAnalyticsRepository implements IAnalyticsRepository {
  findQuestsInWindow(window: AnalyticsWindow) {
    return prisma.quest.findMany({
      where: {
        userId: window.userId,
        status: {
          in: [QuestStatus.COMPLETED, QuestStatus.FAILED]
        },
        updatedAt: {
          gte: window.from,
          lte: window.to
        }
      }
    });
  }

  findXpTransactionsInWindow(window: AnalyticsWindow) {
    return prisma.xpTransaction.findMany({
      where: {
        userId: window.userId,
        createdAt: {
          gte: window.from,
          lte: window.to
        }
      }
    });
  }

  findFocusSessionsInWindow(window: AnalyticsWindow) {
    return prisma.focusSession.findMany({
      where: {
        userId: window.userId,
        startTime: {
          gte: window.from,
          lte: window.to
        },
        durationMinutes: {
          not: null
        }
      }
    });
  }
}
