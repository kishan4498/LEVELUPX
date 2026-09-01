export type CharacterClass = {
  id: string;
  name: string;
  description: string;
  baseXpMultiplier: number;
};

export type Skill = {
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

export type CosmeticItem = {
  id: string;
  name: string;
  description: string;
  slot: "AVATAR_FRAME" | "PROFILE_BADGE";
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
  unlockLevel: number;
  coinPrice: number;
  owned: boolean;
  selected: boolean;
  unlockedAt: string | null;
};

export type UserProfile = {
  id: string;
  avatarUrl: string | null;
  level: number;
  totalXp: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  selectedCharacterClass: CharacterClass | null;
  selectedCosmetic: CosmeticItem | null;
};

export type MarketplaceListing = {
  id: string;
  sellerId: string;
  sellerName: string;
  cosmetic: Omit<CosmeticItem, "owned" | "selected" | "unlockedAt">;
  priceCoins: number;
  status: "ACTIVE" | "SOLD" | "CANCELLED";
  createdAt: string;
};
