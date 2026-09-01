import { InsightType, QuestStatus, type AiInsight } from "@prisma/client";

import { prisma } from "../../prisma/client.js";
import type { NewInsight } from "../../modules/ai-insights/aiInsight.types.js";
import type { BurnoutFeedbackSignal, BurnoutStats } from "./burnoutPrediction.types.js";

export interface IBurnoutPredictionRepository {
  findActiveUserIds(range: { from: Date; to: Date }): Promise<string[]>;
  getUserStats(range: { userId: string; from3Days: Date; from7Days: Date; to: Date }): Promise<BurnoutStats>;
  getFeedbackSignal(window: { userId: string; recentWarningFrom: Date; negativeFeedbackFrom: Date }): Promise<BurnoutFeedbackSignal>;
  createInsight(userId: string, insight: NewInsight): Promise<AiInsight>;
}

export class PrismaBurnoutPredictionRepository implements IBurnoutPredictionRepository {
  async findActiveUserIds(range: { from: Date; to: Date }) {
    const [questUsers, focusUsers] = await Promise.all([
      prisma.quest.findMany({
        where: {
          updatedAt: {
            gte: range.from,
            lte: range.to
          }
        },
        select: { userId: true },
        distinct: ["userId"]
      }),
      prisma.focusSession.findMany({
        where: {
          startTime: {
            gte: range.from,
            lte: range.to
          }
        },
        select: { userId: true },
        distinct: ["userId"]
      })
    ]);

    return [...new Set([...questUsers.map((user) => user.userId), ...focusUsers.map((user) => user.userId)])];
  }

  async getUserStats(range: { userId: string; from3Days: Date; from7Days: Date; to: Date }): Promise<BurnoutStats> {
    const [sessions, quests] = await Promise.all([
      prisma.focusSession.findMany({
        where: {
          userId: range.userId,
          completed: true,
          startTime: {
            gte: range.from3Days,
            lte: range.to
          },
          durationMinutes: {
            not: null
          }
        }
      }),
      prisma.quest.findMany({
        where: {
          userId: range.userId,
          status: {
            in: [QuestStatus.COMPLETED, QuestStatus.FAILED]
          },
          updatedAt: {
            gte: range.from7Days,
            lte: range.to
          }
        },
        select: { status: true }
      })
    ]);

    const minutes = sessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
    const activeDays = new Set(sessions.map((session) => session.startTime.toISOString().slice(0, 10))).size;
    const failed = quests.filter((quest) => quest.status === QuestStatus.FAILED).length;

    return {
      userId: range.userId,
      focusHoursLast3Days: Math.round((minutes / 60) * 10) / 10,
      failedTaskRateLast7Days: quests.length > 0 ? failed / quests.length : 0,
      activeFocusDaysLast7Days: activeDays
    };
  }

  async getFeedbackSignal(window: {
    userId: string;
    recentWarningFrom: Date;
    negativeFeedbackFrom: Date;
  }): Promise<BurnoutFeedbackSignal> {
    const [warning, negative] = await Promise.all([
      prisma.aiInsight.findFirst({
        where: {
          userId: window.userId,
          insightType: InsightType.BURNOUT_WARNING,
          generatedAt: {
            gte: window.recentWarningFrom
          }
        },
        select: { id: true }
      }),
      prisma.aiInsight.findFirst({
        where: {
          userId: window.userId,
          insightType: InsightType.BURNOUT_WARNING,
          feedbackValue: "NOT_HELPFUL",
          feedbackAt: {
            gte: window.negativeFeedbackFrom
          }
        },
        select: { id: true }
      })
    ]);

    return {
      hasRecentWarning: !!warning,
      hasRecentNegativeFeedback: !!negative
    };
  }

  createInsight(userId: string, insight: NewInsight) {
    return prisma.aiInsight.create({
      data: {
        userId,
        insightType: insight.insightType,
        title: insight.title,
        message: insight.message,
        confidenceScore: insight.confidenceScore
      }
    });
  }
}
