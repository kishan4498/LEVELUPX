import { MarketplaceListingStatus, type CharacterClass, type CosmeticItem, type MarketplaceListing, type Skill, type UserCosmetic, type UserSkill } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { IUserRepository, SkillProgressStats, SkillWithPrerequisite, UserWithProfile } from "./user.repository.js";
import { UserService } from "./user.service.js";

function makeSkill(seed: {
  id: string;
  name: string;
  maxLevel?: number;
  prerequisite?: SkillWithPrerequisite | null;
  prerequisiteLevel?: number;
}): SkillWithPrerequisite {
  return {
    id: seed.id,
    name: seed.name,
    description: `${seed.name} description`,
    maxLevel: seed.maxLevel ?? 5,
    prerequisiteSkillId: seed.prerequisite?.id ?? null,
    prerequisiteLevel: seed.prerequisiteLevel ?? 1,
    prerequisite: seed.prerequisite ?? null
  };
}

function makeUserSkill(seed: { userId: string; skill: Skill; level: number }): UserSkill & { skill: Skill } {
  return {
    id: `${seed.userId}-${seed.skill.id}`,
    userId: seed.userId,
    skillId: seed.skill.id,
    level: seed.level,
    skill: seed.skill
  };
}

function makeCosmetic(seed: {
  id: string;
  name: string;
  unlockLevel?: number;
  slot?: CosmeticItem["slot"];
  rarity?: CosmeticItem["rarity"];
}): CosmeticItem {
  return {
    id: seed.id,
    name: seed.name,
    description: `${seed.name} description`,
    slot: seed.slot ?? "AVATAR_FRAME",
    rarity: seed.rarity ?? "COMMON",
    unlockLevel: seed.unlockLevel ?? 1
  };
}

function makeUserCosmetic(seed: {
  userId: string;
  cosmetic: CosmeticItem;
}): UserCosmetic & { cosmeticItem: CosmeticItem } {
  return {
    id: `${seed.userId}-${seed.cosmetic.id}`,
    userId: seed.userId,
    cosmeticItemId: seed.cosmetic.id,
    unlockedAt: new Date("2026-05-23T00:00:00.000Z"),
    cosmeticItem: seed.cosmetic
  };
}

function makeListing(seed: { id?: string; sellerId?: string; sellerName?: string; cosmetic: CosmeticItem; priceCoins?: number; status?: MarketplaceListing["status"] }) {
  return {
    id: seed.id ?? "listing-1",
    sellerId: seed.sellerId ?? "seller-1",
    buyerId: null,
    cosmeticItemId: seed.cosmetic.id,
    priceCoins: seed.priceCoins ?? 125,
    status: seed.status ?? MarketplaceListingStatus.ACTIVE,
    createdAt: new Date("2026-05-25T00:00:00.000Z"),
    soldAt: null,
    cancelledAt: null,
    seller: { name: seed.sellerName ?? "Seller One" },
    cosmeticItem: seed.cosmetic
  };
}

const profileDefaults = {
  timezone: "UTC",
  productivityMode: "PERSONAL" as const,
  preferredFocusMinutes: 25,
  dailyGoalMinutes: 60,
  onboardingCompletedAt: null
};

const emailDefaults = {
  emailVerifiedAt: new Date("2026-05-20T00:00:00.000Z"),
  emailVerificationCodeHash: null,
  emailVerificationExpiresAt: null,
  emailVerificationFailedAttempts: 0
};

function makeRepo(overrides: Partial<IUserRepository>): IUserRepository {
  return {
    async ensureCharacterClasses() {},
    async ensureSkills() {},
    async ensureCosmetics() {},
    async fetchUserGraph(): Promise<UserWithProfile | null> {
      return null;
    },
    async updateUserIdentity(): Promise<UserWithProfile> {
      throw new Error("not implemented");
    },
    async finalizeOnboarding(): Promise<UserWithProfile> {
      throw new Error("not implemented");
    },
    async fetchAvailableClasses(): Promise<CharacterClass[]> {
      return [];
    },
    async findCharacterClassById(): Promise<CharacterClass | null> {
      return null;
    },
    async findSkills() {
      return [];
    },
    async findUserSkills() {
      return [];
    },
    async getSkillProgressStats(): Promise<SkillProgressStats> {
      return {
        completedQuestCount: 0,
        totalFocusMinutes: 0,
        longestStreak: 0,
        guildMembershipCount: 0,
        teamQuestContributionCount: 0,
        recoveryQuestCount: 0
      };
    },
    async upsertUserSkillLevel(userId, skillId, level) {
      return {
        id: `${userId}-${skillId}`,
        userId,
        skillId,
        level
      };
    },
    async findCosmetics() {
      return [];
    },
    async findCosmeticById() {
      return null;
    },
    async findUserCosmetics() {
      return [];
    },
    async unlockEligibleCosmetics() {},
    async findUserCosmetic() {
      return null;
    },
    async purchaseCosmetic(): Promise<UserWithProfile> {
      throw new Error("not implemented");
    },
    async findMarketplaceListings() {
      return [];
    },
    async findMarketplaceListingById() {
      return null;
    },
    async createMarketplaceListing() {
      throw new Error("not implemented");
    },
    async cancelMarketplaceListing() {
      return null;
    },
    async buyMarketplaceListing() {
      throw new Error("not implemented");
    },
    async equipCosmetic(): Promise<UserWithProfile> {
      throw new Error("not implemented");
    },
    async equipCharacterClass(): Promise<UserWithProfile> {
      throw new Error("not implemented");
    },
    ...overrides
  };
}

describe("UserService skills", () => {
  it("derives skill levels from tracked activity and persists unlocked levels", async () => {
    const deepFocus = makeSkill({ id: "skill-1", name: "Deep Focus" });
    const questPlanning = makeSkill({ id: "skill-2", name: "Quest Planning" });
    const persisted: { skillId: string; level: number }[] = [];
    const service = new UserService(
      makeRepo({
        async findSkills() {
          return [deepFocus, questPlanning];
        },
        async getSkillProgressStats() {
          return {
            completedQuestCount: 6,
            totalFocusMinutes: 420,
            longestStreak: 0,
            guildMembershipCount: 0,
            teamQuestContributionCount: 0,
            recoveryQuestCount: 0
          };
        },
        async upsertUserSkillLevel(_userId, skillId, level) {
          persisted.push({ skillId, level });
          return {
            id: `user-1-${skillId}`,
            userId: "user-1",
            skillId,
            level
          };
        }
      })
    );

    const skills = await service.listSkills("user-1");

    expect(skills).toEqual([
      expect.objectContaining({
        name: "Deep Focus",
        currentLevel: 3,
        currentValue: 420,
        nextLevelTarget: 900,
        ruleLabel: "Completed focus minutes"
      }),
      expect.objectContaining({
        name: "Quest Planning",
        currentLevel: 2,
        currentValue: 6,
        nextLevelTarget: 15,
        ruleLabel: "Completed quests"
      })
    ]);
    expect(persisted).toEqual([
      { skillId: "skill-1", level: 3 },
      { skillId: "skill-2", level: 2 }
    ]);
  });

  it("keeps a derived skill locked until its prerequisite reaches the minimum level", async () => {
    const questPlanning = makeSkill({ id: "skill-planning", name: "Quest Planning" });
    const deepFocus = makeSkill({
      id: "skill-focus",
      name: "Deep Focus",
      prerequisite: questPlanning,
      prerequisiteLevel: 2
    });
    const persisted: { skillId: string; level: number }[] = [];
    const service = new UserService(
      makeRepo({
        async findSkills() {
          return [deepFocus, questPlanning];
        },
        async getSkillProgressStats() {
          return {
            completedQuestCount: 1,
            totalFocusMinutes: 420,
            longestStreak: 0,
            guildMembershipCount: 0,
            teamQuestContributionCount: 0,
            recoveryQuestCount: 0
          };
        },
        async upsertUserSkillLevel(_userId, skillId, level) {
          persisted.push({ skillId, level });
          return {
            id: `user-1-${skillId}`,
            userId: "user-1",
            skillId,
            level
          };
        }
      })
    );

    const skills = await service.listSkills("user-1");

    expect(skills).toEqual([
      expect.objectContaining({
        id: deepFocus.id,
        currentLevel: 0,
        unlocked: false,
        locked: true,
        lockedReason: "Reach level 2 in Quest Planning first",
        prerequisite: {
          skillId: questPlanning.id,
          name: questPlanning.name,
          minimumLevel: 2,
          currentLevel: 1,
          satisfied: false
        }
      }),
      expect.objectContaining({
        id: questPlanning.id,
        currentLevel: 1,
        locked: false,
        prerequisite: null
      })
    ]);
    expect(persisted).toEqual([{ skillId: questPlanning.id, level: 1 }]);
  });

  it("keeps a stored skill level when it is higher than the derived level", async () => {
    const guildSupport = makeSkill({ id: "skill-3", name: "Guild Support" });
    const persisted: { skillId: string; level: number }[] = [];
    const service = new UserService(
      makeRepo({
        async findSkills() {
          return [guildSupport];
        },
        async findUserSkills() {
          return [makeUserSkill({ userId: "user-1", skill: guildSupport, level: 4 })];
        },
        async getSkillProgressStats() {
          return {
            completedQuestCount: 0,
            totalFocusMinutes: 0,
            longestStreak: 0,
            guildMembershipCount: 1,
            teamQuestContributionCount: 0,
            recoveryQuestCount: 0
          };
        },
        async upsertUserSkillLevel(_userId, skillId, level) {
          persisted.push({ skillId, level });
          return makeUserSkill({ userId: "user-1", skill: guildSupport, level });
        }
      })
    );

    const skills = await service.listSkills("user-1");

    expect(skills[0]).toMatchObject({
      name: "Guild Support",
      currentLevel: 4,
      currentValue: 1,
      nextLevelTarget: 30
    });
    expect(persisted).toEqual([]);
  });
});

describe("UserService cosmetics", () => {
  it("unlocks level-eligible cosmetics and marks owned items", async () => {
    const starterFrame = makeCosmetic({ id: "cosmetic-1", name: "Apprentice Frame", unlockLevel: 1 });
    const rareFrame = makeCosmetic({ id: "cosmetic-2", name: "Mint Focus Ring", unlockLevel: 5, rarity: "RARE" });
    let unlockedForLevel: number | null = null;
    const service = new UserService(
      makeRepo({
        async fetchUserGraph() {
          return {
            id: "user-1",
            name: "User",
            email: "user@example.com",
            passwordHash: "hash",
            twoStepEnabled: false,
            twoStepCodeHash: null,
            twoStepExpiresAt: null,
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
            adminWebAuthnUserId: null,
            ...emailDefaults,
            role: "USER",
            status: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
            profile: {
              id: "profile-1",
              userId: "user-1",
              avatarUrl: null,
              level: 5,
              totalXp: 1000,
              coins: 50,
              currentStreak: 0,
              longestStreak: 0,
              selectedCharacterClassId: null,
              selectedCosmeticId: starterFrame.id,
              ...profileDefaults,
              selectedCharacterClass: null,
              selectedCosmetic: starterFrame
            }
          };
        },
        async unlockEligibleCosmetics(_userId, level) {
          unlockedForLevel = level;
        },
        async findCosmetics() {
          return [starterFrame, rareFrame];
        },
        async findUserCosmetics() {
          return [makeUserCosmetic({ userId: "user-1", cosmetic: starterFrame })];
        }
      })
    );

    const cosmetics = await service.listCosmetics("user-1");

    expect(unlockedForLevel).toBe(5);
    expect(cosmetics).toEqual([
      expect.objectContaining({
        name: "Apprentice Frame",
        coinPrice: 60,
        owned: true,
        selected: true,
        unlockedAt: "2026-05-23T00:00:00.000Z"
      }),
      expect.objectContaining({
        name: "Mint Focus Ring",
        coinPrice: 170,
        owned: false,
        selected: false
      })
    ]);
  });

  it("blocks selecting cosmetics the user does not own", async () => {
    const service = new UserService(makeRepo({}));

    await expect(service.equipCosmetic("user-1", { cosmeticItemId: "00000000-0000-0000-0000-000000000001" })).rejects.toMatchObject({
      code: "COSMETIC_NOT_OWNED"
    });
  });

  it("purchases an unowned cosmetic with coins", async () => {
    const rareFrame = makeCosmetic({ id: "cosmetic-2", name: "Mint Focus Ring", unlockLevel: 5, rarity: "RARE" });
    let purchaseInput: { cosmeticItemId: string; coinPrice: number; cosmeticName: string } | null = null;
    const service = new UserService(
      makeRepo({
        async fetchUserGraph() {
          return {
            id: "user-1",
            name: "User",
            email: "user@example.com",
            passwordHash: "hash",
            twoStepEnabled: false,
            twoStepCodeHash: null,
            twoStepExpiresAt: null,
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
            adminWebAuthnUserId: null,
            ...emailDefaults,
            role: "USER",
            status: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
            profile: {
              id: "profile-1",
              userId: "user-1",
              avatarUrl: null,
              level: 3,
              totalXp: 700,
              coins: 200,
              currentStreak: 0,
              longestStreak: 0,
              selectedCharacterClassId: null,
              selectedCosmeticId: null,
              ...profileDefaults,
              selectedCharacterClass: null,
              selectedCosmetic: null
            }
          };
        },
        async findCosmeticById() {
          return rareFrame;
        },
        async purchaseCosmetic(purchase) {
          purchaseInput = {
            cosmeticItemId: purchase.cosmeticItemId,
            coinPrice: purchase.coinPrice,
            cosmeticName: purchase.cosmeticName
          };

          return {
            id: "user-1",
            name: "User",
            email: "user@example.com",
            passwordHash: "hash",
            twoStepEnabled: false,
            twoStepCodeHash: null,
            twoStepExpiresAt: null,
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
            adminWebAuthnUserId: null,
            ...emailDefaults,
            role: "USER",
            status: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
            profile: {
              id: "profile-1",
              userId: "user-1",
              avatarUrl: null,
              level: 3,
              totalXp: 700,
              coins: 30,
              currentStreak: 0,
              longestStreak: 0,
              selectedCharacterClassId: null,
              selectedCosmeticId: null,
              ...profileDefaults,
              selectedCharacterClass: null,
              selectedCosmetic: null
            }
          };
        }
      })
    );

    const profile = await service.purchaseCosmetic("user-1", { cosmeticItemId: rareFrame.id });

    expect(purchaseInput).toEqual({
      cosmeticItemId: rareFrame.id,
      coinPrice: 170,
      cosmeticName: "Mint Focus Ring"
    });
    expect(profile.coins).toBe(30);
  });

  it("blocks cosmetic purchases when coins are insufficient", async () => {
    const epicBadge = makeCosmetic({ id: "cosmetic-3", name: "Legend Trail Badge", unlockLevel: 10, rarity: "EPIC" });
    const service = new UserService(
      makeRepo({
        async fetchUserGraph() {
          return {
            id: "user-1",
            name: "User",
            email: "user@example.com",
            passwordHash: "hash",
            twoStepEnabled: false,
            twoStepCodeHash: null,
            twoStepExpiresAt: null,
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
            adminWebAuthnUserId: null,
            ...emailDefaults,
            role: "USER",
            status: "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
            profile: {
              id: "profile-1",
              userId: "user-1",
              avatarUrl: null,
              level: 2,
              totalXp: 200,
              coins: 25,
              currentStreak: 0,
              longestStreak: 0,
              selectedCharacterClassId: null,
              selectedCosmeticId: null,
              ...profileDefaults,
              selectedCharacterClass: null,
              selectedCosmetic: null
            }
          };
        },
        async findCosmeticById() {
          return epicBadge;
        }
      })
    );

    await expect(service.purchaseCosmetic("user-1", { cosmeticItemId: epicBadge.id })).rejects.toMatchObject({
      code: "INSUFFICIENT_COINS"
    });
  });

  it("creates a marketplace listing for an owned cosmetic", async () => {
    const frame = makeCosmetic({ id: "cosmetic-1", name: "Trade Frame" });
    let listingInput: { sellerId: string; cosmeticItemId: string; priceCoins: number } | null = null;
    const service = new UserService(
      makeRepo({
        async findUserCosmetic() {
          return makeUserCosmetic({ userId: "user-1", cosmetic: frame });
        },
        async createMarketplaceListing(listingDraft) {
          listingInput = listingDraft;
          return makeListing({
            cosmetic: frame,
            sellerId: listingDraft.sellerId,
            priceCoins: listingDraft.priceCoins
          });
        }
      })
    );

    await expect(service.createMarketplaceListing("user-1", { cosmeticItemId: frame.id, priceCoins: 140 })).resolves.toMatchObject({
      sellerId: "user-1",
      priceCoins: 140,
      cosmetic: expect.objectContaining({ name: "Trade Frame" })
    });
    expect(listingInput).toEqual({ sellerId: "user-1", cosmeticItemId: frame.id, priceCoins: 140 });
  });

  it("passes marketplace listing filters into the repository", async () => {
    const frame = makeCosmetic({ id: "cosmetic-1", name: "Search Frame", rarity: "EPIC" });
    let listingQuery: Parameters<IUserRepository["findMarketplaceListings"]>[0] | null = null;
    const service = new UserService(
      makeRepo({
        async findMarketplaceListings(query) {
          listingQuery = query;
          return [makeListing({ cosmetic: frame, priceCoins: 180 })];
        }
      })
    );

    await expect(
      service.listMarketplaceListings({
        q: "frame",
        rarity: "EPIC",
        minPriceCoins: 100,
        maxPriceCoins: 250
      })
    ).resolves.toHaveLength(1);
    expect(listingQuery).toEqual({
      q: "frame",
      rarity: "EPIC",
      minPriceCoins: 100,
      maxPriceCoins: 250
    });
  });

  it("buys a marketplace listing and returns the buyer profile", async () => {
    const frame = makeCosmetic({ id: "cosmetic-1", name: "Trade Frame" });
    const buyer = {
      id: "buyer-1",
      name: "Buyer",
      email: "buyer@example.com",
      passwordHash: "hash",
      twoStepEnabled: false,
      twoStepCodeHash: null,
      twoStepExpiresAt: null,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      adminWebAuthnUserId: null,
      ...emailDefaults,
      role: "USER" as const,
      status: "ACTIVE" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      profile: {
        id: "profile-1",
        userId: "buyer-1",
        avatarUrl: null,
        level: 1,
        totalXp: 0,
        coins: 60,
        currentStreak: 0,
        longestStreak: 0,
        selectedCharacterClassId: null,
        selectedCosmeticId: null,
        ...profileDefaults,
        selectedCharacterClass: null,
        selectedCosmetic: null
      }
    };
    const service = new UserService(
      makeRepo({
        async findMarketplaceListingById() {
          return makeListing({ id: "listing-1", sellerId: "seller-1", cosmetic: frame, priceCoins: 140 });
        },
        async buyMarketplaceListing() {
          return {
            listing: makeListing({ id: "listing-1", sellerId: "seller-1", cosmetic: frame, priceCoins: 140, status: MarketplaceListingStatus.SOLD }),
            buyer
          };
        }
      })
    );

    await expect(service.buyMarketplaceListing("buyer-1", "listing-1")).resolves.toMatchObject({
      listing: {
        status: "SOLD",
        priceCoins: 140
      },
      profile: {
        coins: 60
      }
    });
  });
});
