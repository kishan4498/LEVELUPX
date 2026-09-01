import type { CustomReward } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import type { ICustomRewardRepository } from "./customReward.repository.js";

export class CustomRewardService {
  constructor(private readonly repo: ICustomRewardRepository) {}

  async create(userId: string, rewardDraft: { title: string; description?: string; costCoins: number }) {
    return this.toDto(await this.repo.create(userId, rewardDraft));
  }

  async list(userId: string) {
    return (await this.repo.list(userId)).map((reward) => this.toDto(reward));
  }

  async deactivate(userId: string, id: string) {
    if (!(await this.repo.deactivate(userId, id))) {
      throw new AppError("Personal reward not found", 404, "CUSTOM_REWARD_NOT_FOUND");
    }
  }

  async redeem(userId: string, id: string) {
    try {
      const redemption = await this.repo.redeem(userId, id);

      if (!redemption) {
        throw new AppError("Personal reward not found", 404, "CUSTOM_REWARD_NOT_FOUND");
      }

      return {
        reward: this.toDto(redemption.reward),
        balance: redemption.balance,
        redeemedAt: redemption.redemption.redeemedAt.toISOString()
      };
    } catch (error) {
      if (error instanceof Error && error.message === "CUSTOM_REWARD_INSUFFICIENT_COINS") {
        throw new AppError("Not enough coins for this personal reward", 400, "INSUFFICIENT_COINS");
      }

      throw error;
    }
  }

  async history(userId: string) {
    return (await this.repo.history(userId)).map((redemption) => ({
      id: redemption.id,
      rewardId: redemption.rewardId,
      title: redemption.reward.title,
      costCoins: redemption.costCoins,
      redeemedAt: redemption.redeemedAt.toISOString()
    }));
  }

  private toDto(reward: CustomReward) {
    return {
      id: reward.id,
      title: reward.title,
      description: reward.description,
      costCoins: reward.costCoins,
      active: reward.active,
      createdAt: reward.createdAt.toISOString()
    };
  }
}
