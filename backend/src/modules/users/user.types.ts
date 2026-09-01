import type { CosmeticRarity, CosmeticSlot, ProductivityMode, Role, UserStatus } from "@prisma/client";

export type ClassDto = {
  id: string;
  name: string;
  description: string;
  baseXpMultiplier: number;
};

export type SkillDto = {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  currentLevel: number;
  unlocked: boolean;
  locked: boolean;
  lockedReason: string | null;
  prerequisite: {
    skillId: string;
    name: string;
    minimumLevel: number;
    currentLevel: number;
    satisfied: boolean;
  } | null;
  currentValue: number;
  nextLevelTarget: number | null;
  progressPercent: number;
  ruleLabel: string;
};

export type ProfileDto = {
  id: string;
  avatarUrl: string | null;
  level: number;
  totalXp: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  timezone: string;
  productivityMode: ProductivityMode;
  preferredFocusMinutes: number;
  dailyGoalMinutes: number;
  onboardingCompletedAt: string | null;
  selectedCharacterClass: ClassDto | null;
  selectedCosmetic: SkinDto | null;
};

export type SkinDto = {
  id: string;
  name: string;
  description: string;
  slot: CosmeticSlot;
  rarity: CosmeticRarity;
  unlockLevel: number;
  coinPrice: number;
  owned: boolean;
  selected: boolean;
  unlockedAt: string | null;
};

export type SelectSkinInput = {
  cosmeticItemId: string;
};

export type BuySkinInput = {
  cosmeticItemId: string;
};

export type ListingInput = {
  cosmeticItemId: string;
  priceCoins: number;
};

export type ListingQuery = {
  q?: string;
  rarity?: CosmeticRarity;
  minPriceCoins?: number;
  maxPriceCoins?: number;
};

export type ListingDto = {
  id: string;
  sellerId: string;
  sellerName: string;
  cosmetic: Omit<SkinDto, "owned" | "selected" | "unlockedAt">;
  priceCoins: number;
  status: "ACTIVE" | "SOLD" | "CANCELLED";
  createdAt: string;
};

export type MeDto = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  profile: ProfileDto | null;
};

export type UpdateMeInput = {
  name?: string;
  avatarUrl?: string | null;
};

export type SelectClassInput = {
  characterClassId: string;
};

export type OnboardInput = {
  timezone: string;
  productivityMode: ProductivityMode;
  preferredFocusMinutes: number;
  dailyGoalMinutes: number;
  characterClassId?: string;
};
