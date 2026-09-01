import type { AchievementRarity } from "@prisma/client";

export type AchievementResponseDto = {
  id: string;
  title: string;
  description: string;
  conditionType: string;
  conditionValue: number;
  xpBonus: number;
  coinBonus: number;
  rarity: AchievementRarity;
};

export type UserAchievementResponseDto = AchievementResponseDto & {
  unlockedAt: string;
};

export type AchievementProgressResponseDto = AchievementResponseDto & {
  currentValue: number;
  progressPercent: number;
  unlocked: boolean;
  unlockedAt: string | null;
};

export type AchievementUnlockResponseDto = {
  achievements: UserAchievementResponseDto[];
  profile: {
    level: number;
    totalXp: number;
    coins: number;
  } | null;
};

export type AchievementProgressStats = {
  completedQuestCount: number;
  totalXp: number;
  totalFocusMinutes: number;
};
