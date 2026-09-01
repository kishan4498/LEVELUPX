export type RewardSummary = {
  level: number;
  totalXp: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  totalXpEarned: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
};

export type RewardEconomyContext = {
  xpMultiplier: number;
  coinMultiplier: number;
  inflationRate: number;
  dailyCoinLimit: number;
  maxQuestReward: number;
  coinsEarnedToday: number;
  remainingDailyCoins: number;
  updatedAt: string;
};

export type XpHistoryItem = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  amount: number;
  multiplier: number;
  reason: string;
  createdAt: string;
};

export type CoinHistoryItem = {
  id: string;
  type: string;
  amount: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
};

export type CustomReward = {
  id: string;
  title: string;
  description: string | null;
  costCoins: number;
  active: boolean;
  createdAt: string;
};

export type CustomRewardRedemption = {
  id: string;
  rewardId: string;
  title: string;
  costCoins: number;
  redeemedAt: string;
};
