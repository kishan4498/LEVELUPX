export type AchievementRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  conditionType: string;
  conditionValue: number;
  xpBonus: number;
  coinBonus: number;
  rarity: AchievementRarity;
};

export type UserAchievement = Achievement & {
  unlockedAt: string;
};

export type AchievementProgress = Achievement & {
  currentValue: number;
  progressPercent: number;
  unlocked: boolean;
  unlockedAt: string | null;
};
