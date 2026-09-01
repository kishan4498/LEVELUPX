import { AbuseSeverity, Prisma, type AbuseReport } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type CreateAbuseReportData = {
  userId: string;
  reason: string;
  severity: AbuseSeverity;
  dedupeKey?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type CreateAutomaticAbuseReportData = CreateAbuseReportData & {
  dedupeKey: string;
};

export type AbuseCompletionStats = {
  completionsLastHour: number;
  repeatedTitleCompletionsToday: number;
};

export interface IAbuseRepository {
  create(report: CreateAbuseReportData): Promise<AbuseReport>;
  createAutomaticOpen(report: CreateAutomaticAbuseReportData): Promise<AbuseReport | null>;
  findForUser(userId: string): Promise<AbuseReport[]>;
  getCompletionStats(quest: { userId: string; questTitle: string }): Promise<AbuseCompletionStats>;
}

export class PrismaAbuseRepository implements IAbuseRepository {
  create(report: CreateAbuseReportData) {
    return prisma.abuseReport.create({
      data: report
    });
  }

  async createAutomaticOpen(report: CreateAutomaticAbuseReportData) {
    try {
      return await prisma.abuseReport.create({
        data: report
      });
    } catch (error) {
      // The partial unique index is the concurrency boundary for automatic signals.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }

      throw error;
    }
  }

  findForUser(userId: string) {
    return prisma.abuseReport.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  async getCompletionStats(quest: { userId: string; questTitle: string }): Promise<AbuseCompletionStats> {
    const now = new Date();
    const hourAgo = new Date(now);
    hourAgo.setUTCHours(now.getUTCHours() - 1);
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    const [completionsLastHour, repeatedTitleCompletionsToday] = await Promise.all([
      prisma.questCompletion.count({
        where: {
          userId: quest.userId,
          completedAt: {
            gte: hourAgo
          }
        }
      }),
      prisma.questCompletion.count({
        where: {
          userId: quest.userId,
          completedAt: {
            gte: dayStart
          },
          quest: {
            title: quest.questTitle
          }
        }
      })
    ]);

    return {
      completionsLastHour,
      repeatedTitleCompletionsToday
    };
  }
}
