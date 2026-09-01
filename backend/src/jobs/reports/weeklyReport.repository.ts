import { CoinTransactionType, QuestStatus, Role, type AdminReport, type Prisma } from "@prisma/client";

import { prisma } from "../../prisma/client.js";
import type { WeeklyReportSource } from "./weeklyReport.types.js";

export interface IWeeklyReportRepository {
  getWeeklyReportSource(range: { from: Date; to: Date }): Promise<WeeklyReportSource>;
  findReportOwner(): Promise<{ id: string } | null>;
  createWeeklyReportRecord(report: {
    adminUserId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageKey?: string | null;
    metadata: Prisma.InputJsonObject;
  }): Promise<AdminReport>;
}

export class PrismaWeeklyReportRepository implements IWeeklyReportRepository {
  async getWeeklyReportSource(range: { from: Date; to: Date }): Promise<WeeklyReportSource> {
    const [questUsers, focusUsers, completed, failed, xp, coins, focus] =
      await Promise.all([
        prisma.questCompletion.findMany({
          where: {
            completedAt: {
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
        }),
        prisma.quest.count({
          where: {
            status: QuestStatus.COMPLETED,
            updatedAt: {
              gte: range.from,
              lte: range.to
            }
          }
        }),
        prisma.quest.count({
          where: {
            status: QuestStatus.FAILED,
            updatedAt: {
              gte: range.from,
              lte: range.to
            }
          }
        }),
        prisma.xpTransaction.aggregate({
          where: {
            createdAt: {
              gte: range.from,
              lte: range.to
            }
          },
          _sum: { amount: true }
        }),
        prisma.coinTransaction.aggregate({
          where: {
            type: {
              in: [CoinTransactionType.EARNED, CoinTransactionType.BONUS, CoinTransactionType.ADMIN_ADJUSTMENT]
            },
            createdAt: {
              gte: range.from,
              lte: range.to
            }
          },
          _sum: { amount: true }
        }),
        prisma.focusSession.aggregate({
          where: {
            startTime: {
              gte: range.from,
              lte: range.to
            },
            durationMinutes: {
              not: null
            }
          },
          _sum: { durationMinutes: true }
        })
      ]);

    const activeUsers = new Set([...questUsers.map((user) => user.userId), ...focusUsers.map((user) => user.userId)]);

    return {
      from: range.from,
      to: range.to,
      activeUserCount: activeUsers.size,
      completedQuestCount: completed,
      failedQuestCount: failed,
      xpGenerated: xp._sum.amount ?? 0,
      coinsEarned: coins._sum.amount ?? 0,
      focusMinutes: focus._sum.durationMinutes ?? 0
    };
  }

  async findReportOwner() {
    return prisma.user.findFirst({
      where: {
        role: {
          in: [Role.SUPER_ADMIN, Role.ADMIN]
        }
      },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      select: { id: true }
    });
  }

  createWeeklyReportRecord(report: {
    adminUserId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageKey?: string | null;
    metadata: Prisma.InputJsonObject;
  }) {
    return prisma.adminReport.create({
      data: {
        adminUserId: report.adminUserId,
        reportType: "WEEKLY_PLATFORM_SUMMARY",
        format: "CSV",
        filename: report.filename,
        contentType: report.contentType,
        sizeBytes: report.sizeBytes,
        storageKey: report.storageKey ?? null,
        metadata: report.metadata
      }
    });
  }
}
