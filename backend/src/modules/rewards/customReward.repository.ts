import { CoinTransactionType, type CustomReward, type CustomRewardRedemption } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type CustomRewardRedemptionWithReward = CustomRewardRedemption & {
  reward: Pick<CustomReward, "title">;
};

export interface ICustomRewardRepository {
  create(userId: string, rewardDraft: { title: string; description?: string; costCoins: number }): Promise<CustomReward>;
  list(userId: string): Promise<CustomReward[]>;
  deactivate(userId: string, rewardId: string): Promise<boolean>;
  redeem(userId: string, rewardId: string): Promise<{ reward: CustomReward; balance: number; redemption: CustomRewardRedemption } | null>;
  history(userId: string): Promise<CustomRewardRedemptionWithReward[]>;
}

export class PrismaCustomRewardRepository implements ICustomRewardRepository {
  create(userId: string, rewardDraft: { title: string; description?: string; costCoins: number }) {
    return prisma.customReward.create({ data: { userId, ...rewardDraft } });
  }

  list(userId: string) {
    return prisma.customReward.findMany({
      where: { userId },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }]
    });
  }

  async deactivate(userId: string, id: string) {
    const updated = await prisma.customReward.updateMany({
      where: { id, userId, active: true },
      data: { active: false }
    });
    return updated.count === 1;
  }

  redeem(userId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const reward = await tx.customReward.findFirst({
        where: { id, userId, active: true }
      });

      if (!reward) {
        return null;
      }

      const debited = await tx.userProfile.updateMany({
        where: {
          userId,
          coins: { gte: reward.costCoins }
        },
        data: {
          coins: { decrement: reward.costCoins }
        }
      });

      if (debited.count !== 1) {
        throw new Error("CUSTOM_REWARD_INSUFFICIENT_COINS");
      }

      const profile = await tx.userProfile.findUniqueOrThrow({ where: { userId } });
      const redemption = await tx.customRewardRedemption.create({
        data: {
          userId,
          rewardId: reward.id,
          costCoins: reward.costCoins
        }
      });

      await tx.coinTransaction.create({
        data: {
          userId,
          type: CoinTransactionType.SPENT,
          amount: -reward.costCoins,
          reason: `Redeemed personal reward: ${reward.title}`,
          balanceAfter: profile.coins
        }
      });

      return { reward, balance: profile.coins, redemption };
    });
  }

  history(userId: string) {
    return prisma.customRewardRedemption.findMany({
      where: { userId },
      include: { reward: { select: { title: true } } },
      orderBy: { redeemedAt: "desc" },
      take: 30
    });
  }
}
