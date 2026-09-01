import { CoinTransactionType, type CoinTransaction, type EconomySettings, type XpTransaction } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type RewardSummaryRecord = {
  profile: {
    level: number;
    totalXp: number;
    coins: number;
    currentStreak: number;
    longestStreak: number;
  } | null;
  totalXpEarned: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
};

export interface IRewardRepository {
  getSummary(userId: string): Promise<RewardSummaryRecord>;
  findXpHistory(userId: string, page: { skip: number; take: number }): Promise<XpTransaction[]>;
  findCoinHistory(userId: string, page: { skip: number; take: number }): Promise<CoinTransaction[]>;
  getEconomySettings(): Promise<EconomySettings>;
  getCoinsEarnedToday(userId: string): Promise<number>;
}

export class PrismaRewardRepository implements IRewardRepository {
  async getSummary(userId: string): Promise<RewardSummaryRecord> {
    const [profile, xpTotals, coinEarnedTotals, coinSpentTotals] = await Promise.all([
      prisma.userProfile.findUnique({
        where: { userId },
        select: {
          level: true,
          totalXp: true,
          coins: true,
          currentStreak: true,
          longestStreak: true
        }
      }),
      prisma.xpTransaction.aggregate({
        where: { userId },
        _sum: { amount: true }
      }),
      prisma.coinTransaction.aggregate({
        where: {
          userId,
          type: {
            in: [CoinTransactionType.EARNED, CoinTransactionType.BONUS, CoinTransactionType.ADMIN_ADJUSTMENT]
          }
        },
        _sum: { amount: true }
      }),
      prisma.coinTransaction.aggregate({
        where: {
          userId,
          type: {
            in: [CoinTransactionType.SPENT, CoinTransactionType.PENALTY]
          }
        },
        _sum: { amount: true }
      })
    ]);

    return {
      profile,
      totalXpEarned: xpTotals._sum.amount ?? 0,
      totalCoinsEarned: coinEarnedTotals._sum.amount ?? 0,
      totalCoinsSpent: coinSpentTotals._sum.amount ?? 0
    };
  }

  findXpHistory(userId: string, page: { skip: number; take: number }) {
    return prisma.xpTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
  }

  findCoinHistory(userId: string, page: { skip: number; take: number }) {
    return prisma.coinTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
  }

  async getEconomySettings() {
    const settings = await prisma.economySettings.findFirst({
      orderBy: { createdAt: "asc" }
    });

    if (settings) {
      return settings;
    }

    return prisma.economySettings.create({
      data: {}
    });
  }

  async getCoinsEarnedToday(userId: string) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const totals = await prisma.coinTransaction.aggregate({
      where: {
        userId,
        type: {
          in: [CoinTransactionType.EARNED, CoinTransactionType.BONUS, CoinTransactionType.ADMIN_ADJUSTMENT]
        },
        createdAt: {
          gte: dayStart
        }
      },
      _sum: {
        amount: true
      }
    });

    return totals._sum.amount ?? 0;
  }
}
