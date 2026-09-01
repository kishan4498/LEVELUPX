import { QuestStatus, type AiInsight, type AiPromptRun, type Prisma } from "@prisma/client";

import { prisma } from "../../prisma/client.js";
import type {
  FeedbackInput,
  NewInsight,
  NewPromptRun,
  TrainingCtx,
  ScheduleCtx,
  ProdStats
} from "./aiInsight.types.js";

export interface IAiInsightRepository {
  findForUser(userId: string): Promise<AiInsight[]>;
  findPromptRunsForUser(userId: string): Promise<AiPromptRun[]>;
  findFeedbackForUser(userId: string): Promise<AiInsight[]>;
  getProductivityStats(userId: string): Promise<ProdStats>;
  getStudyScheduleContext(userId: string): Promise<ScheduleCtx>;
  getSchedulingTrainingContext(userId: string): Promise<TrainingCtx>;
  createMany(userId: string, insights: NewInsight[], providerSource?: string): Promise<AiInsight[]>;
  createPromptRun(run: NewPromptRun): Promise<AiPromptRun>;
  updateFeedback(change: { userId: string; insightId: string; feedback: FeedbackInput }): Promise<AiInsight | null>;
}

export class PrismaAiInsightRepository implements IAiInsightRepository {
  findForUser(userId: string) {
    return prisma.aiInsight.findMany({
      where: { userId },
      orderBy: { generatedAt: "desc" },
      take: 20
    });
  }

  findFeedbackForUser(userId: string) {
    return prisma.aiInsight.findMany({
      where: {
        userId,
        feedbackValue: {
          not: null
        }
      },
      orderBy: { feedbackAt: "desc" },
      take: 100
    });
  }

  findPromptRunsForUser(userId: string) {
    return prisma.aiPromptRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20
    });
  }

  async getProductivityStats(userId: string): Promise<ProdStats> {
    const now = new Date();
    const threeDaysAgo = this.daysAgo(now, 3);
    const sevenDaysAgo = this.daysAgo(now, 7);

    const [focusSessions, resolvedQuests] = await Promise.all([
      prisma.focusSession.findMany({
        where: {
          userId,
          completed: true,
          startTime: {
            gte: threeDaysAgo,
            lte: now
          },
          durationMinutes: {
            not: null
          }
        }
      }),
      prisma.quest.findMany({
        where: {
          userId,
          status: {
            in: [QuestStatus.COMPLETED, QuestStatus.FAILED]
          },
          updatedAt: {
            gte: sevenDaysAgo,
            lte: now
          }
        },
        select: {
          status: true
        }
      })
    ]);

    const focusMinutes = focusSessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
    const activeFocusDays = new Set(focusSessions.map((session) => session.startTime.toISOString().slice(0, 10))).size;
    const failedQuests = resolvedQuests.filter((quest) => quest.status === QuestStatus.FAILED).length;
    const completedQuests = resolvedQuests.filter((quest) => quest.status === QuestStatus.COMPLETED).length;

    return {
      focusHoursLast3Days: Math.round((focusMinutes / 60) * 10) / 10,
      failedTaskRateLast7Days: resolvedQuests.length > 0 ? failedQuests / resolvedQuests.length : 0,
      completedQuestsLast7Days: completedQuests,
      activeFocusDaysLast7Days: activeFocusDays
    };
  }

  async getStudyScheduleContext(userId: string): Promise<ScheduleCtx> {
    const now = new Date();
    const threeDaysAgo = this.daysAgo(now, 3);
    const sevenDaysAgo = this.daysAgo(now, 7);

    const [quests, recentSessions, weeklySessions] = await Promise.all([
      prisma.quest.findMany({
        where: {
          userId,
          status: {
            in: [QuestStatus.PENDING, QuestStatus.IN_PROGRESS]
          }
        },
        select: {
          id: true,
          title: true,
          difficulty: true,
          category: true,
          estimatedMinutes: true,
          status: true,
          dueDate: true
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 12
      }),
      prisma.focusSession.findMany({
        where: {
          userId,
          completed: true,
          startTime: {
            gte: threeDaysAgo,
            lte: now
          },
          durationMinutes: {
            not: null
          }
        },
        select: {
          durationMinutes: true
        }
      }),
      prisma.focusSession.findMany({
        where: {
          userId,
          completed: true,
          startTime: {
            gte: sevenDaysAgo,
            lte: now
          }
        },
        select: {
          startTime: true
        }
      })
    ]);

    return {
      quests,
      focusMinutesLast3Days: recentSessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0),
      activeFocusDaysLast7Days: new Set(weeklySessions.map((session) => session.startTime.toISOString().slice(0, 10))).size
    };
  }

  async getSchedulingTrainingContext(userId: string): Promise<TrainingCtx> {
    const now = new Date();
    const fourteenDaysAgo = this.daysAgo(now, 14);

    const [quests, sessions] = await Promise.all([
      prisma.quest.findMany({
        where: {
          userId,
          updatedAt: {
            gte: fourteenDaysAgo,
            lte: now
          },
          status: {
            in: [QuestStatus.COMPLETED, QuestStatus.FAILED, QuestStatus.IN_PROGRESS, QuestStatus.PENDING]
          }
        },
        select: {
          id: true,
          title: true,
          difficulty: true,
          category: true,
          estimatedMinutes: true,
          status: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { updatedAt: "desc" },
        take: 100
      }),
      prisma.focusSession.findMany({
        where: {
          userId,
          completed: true,
          startTime: {
            gte: fourteenDaysAgo,
            lte: now
          },
          durationMinutes: {
            not: null
          }
        },
        select: {
          startTime: true,
          durationMinutes: true
        }
      })
    ]);

    return {
      questOutcomes: quests,
      focusMinutesLast14Days: sessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0),
      activeFocusDaysLast14Days: new Set(sessions.map((session) => session.startTime.toISOString().slice(0, 10))).size
    };
  }

  async createMany(userId: string, insights: NewInsight[], providerSource?: string) {
    if (insights.length === 0) {
      return [];
    }

    const created: AiInsight[] = [];

    for (const insight of insights) {
      const insightCreate = {
        user: {
          connect: { id: userId }
        },
        insightType: insight.insightType,
        title: insight.title,
        message: insight.message,
        confidenceScore: insight.confidenceScore,
        ...(providerSource ? { providerSource } : {})
      } satisfies Prisma.AiInsightCreateInput;

      created.push(await prisma.aiInsight.create({ data: insightCreate }));
    }

    return created;
  }

  createPromptRun(run: NewPromptRun) {
    return prisma.aiPromptRun.create({
      data: run
    });
  }

  async updateFeedback(change: { userId: string; insightId: string; feedback: FeedbackInput }) {
    const updated = await prisma.aiInsight.updateMany({
      where: {
        id: change.insightId,
        userId: change.userId
      },
      data: {
        feedbackValue: change.feedback.feedbackValue,
        feedbackComment: change.feedback.feedbackComment?.trim() || null,
        feedbackAt: new Date()
      }
    });

    if (updated.count === 0) {
      return null;
    }

    return prisma.aiInsight.findFirst({
      where: {
        id: change.insightId,
        userId: change.userId
      }
    });
  }

  private daysAgo(now: Date, days: number) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - days);
    return date;
  }
}
