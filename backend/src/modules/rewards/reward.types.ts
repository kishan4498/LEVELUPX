import type { Difficulty } from "@prisma/client";

export type QuestRewardInput = {
  quest: {
    xpReward: number;
    coinReward: number;
    difficulty: Difficulty;
  };
  currentStreak: number;
};

export type RewardResult = {
  xp: number;
  coins: number;
  multiplier: number;
  dailyCoinLimitApplied: boolean;
};

export type RewardHistoryInput = {
  page: number;
  limit: number;
};

export type RewardSummaryDto = {
  level: number;
  totalXp: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  totalXpEarned: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
};

export type RewardEconomyContextDto = {
  xpMultiplier: number;
  coinMultiplier: number;
  inflationRate: number;
  dailyCoinLimit: number;
  maxQuestReward: number;
  coinsEarnedToday: number;
  remainingDailyCoins: number;
  updatedAt: string;
};

export type XpHistoryItemDto = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  amount: number;
  multiplier: number;
  reason: string;
  createdAt: string;
};

export type CoinHistoryItemDto = {
  id: string;
  type: string;
  amount: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
};

export type RewardExportFileDto = {
  filename: string;
  contentType: string;
  content: string;
};
