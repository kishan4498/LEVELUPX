import type { AiInsight } from "@prisma/client";

import { prisma } from "../../prisma/client.js";
import type { NewInsight, NewPromptRun, ProdStats } from "../../modules/ai-insights/aiInsight.types.js";

export interface IScheduledInsightRepository {
  findActiveUserIds(range: { from: Date; to: Date }): Promise<string[]>;
  getProductivityStats(range: { userId: string; from3Days: Date; from7Days: Date; to: Date }): Promise<ProdStats>;
  hasRecentInsight(window: { userId: string; since: Date }): Promise<boolean>;
  createMany(userId: string, insights: NewInsight[], providerSource: string): Promise<AiInsight[]>;
  createPromptRun(run: NewPromptRun): Promise<void>;
}

export class PrismaScheduledInsightRepository implements IScheduledInsightRepository {
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

  async getProductivityStats(range: {
    userId: string;
    from3Days: Date;
    from7Days: Date;
    to: Date;
  }): Promise<ProdStats> {
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
            in: ["COMPLETED", "FAILED"]
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
    const failed = quests.filter((quest) => quest.status === "FAILED").length;
    const completed = quests.filter((quest) => quest.status === "COMPLETED").length;

    return {
      focusHoursLast3Days: Math.round((minutes / 60) * 10) / 10,
      failedTaskRateLast7Days: quests.length > 0 ? failed / quests.length : 0,
      completedQuestsLast7Days: completed,
      activeFocusDaysLast7Days: activeDays
    };
  }

  async hasRecentInsight(window: { userId: string; since: Date }) {
    const insight = await prisma.aiInsight.findFirst({
      where: {
        userId: window.userId,
        generatedAt: {
          gte: window.since
        }
      },
      select: { id: true }
    });

    return !!insight;
  }

  async createMany(userId: string, insights: NewInsight[], providerSource: string) {
    const created: AiInsight[] = [];

    for (const insight of insights) {
      created.push(
        await prisma.aiInsight.create({
          data: {
            userId,
            insightType: insight.insightType,
            title: insight.title,
            message: insight.message,
            confidenceScore: insight.confidenceScore,
            providerSource
          }
        })
      );
    }

    return created;
  }

  async createPromptRun(run: NewPromptRun) {
    await prisma.aiPromptRun.create({
      data: run
    });
  }
}
