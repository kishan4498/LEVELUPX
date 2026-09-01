import { CoinTransactionType, MarketplaceListingStatus, type CharacterClass, type CosmeticItem, type Prisma, type Skill, type UserCosmetic, type UserSkill } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";

import { prisma } from "../../prisma/client.js";
import { builtInCharacterClasses } from "./characterClass.seed.js";
import { builtInCosmetics } from "./cosmetic.seed.js";
import { builtInSkills } from "./skill.seed.js";

const userInclude = {
  profile: {
    include: {
      selectedCharacterClass: true,
      selectedCosmetic: true
    }
  }
} satisfies Prisma.UserInclude;

export type UserWithProfile = Prisma.UserGetPayload<{
  include: typeof userInclude;
}>;

const listingInclude = {
  seller: { select: { name: true } },
  cosmeticItem: true
} satisfies Prisma.MarketplaceListingInclude;

export type MarketplaceListingWithDetails = Prisma.MarketplaceListingGetPayload<{
  include: typeof listingInclude;
}>;

export type SkillProgressStats = {
  completedQuestCount: number;
  totalFocusMinutes: number;
  longestStreak: number;
  guildMembershipCount: number;
  teamQuestContributionCount: number;
  recoveryQuestCount: number;
};

export type SkillWithPrerequisite = Skill & {
  prerequisite: Skill | null;
};

export interface IUserRepository {
  ensureCharacterClasses(): Promise<void>;
  ensureSkills(): Promise<void>;
  ensureCosmetics(): Promise<void>;
  fetchUserGraph(id: string): Promise<UserWithProfile | null>;
  updateUserIdentity(userId: string, patch: { name?: string; avatarUrl?: string | null }): Promise<UserWithProfile>;
  finalizeOnboarding(onboarding: {
    userId: string;
    timezone: string;
    productivityMode: "STUDENT" | "PROFESSIONAL" | "PERSONAL";
    preferredFocusMinutes: number;
    dailyGoalMinutes: number;
    characterClassId?: string;
  }): Promise<UserWithProfile>;
  fetchAvailableClasses(): Promise<CharacterClass[]>;
  findCharacterClassById(id: string): Promise<CharacterClass | null>;
  findSkills(): Promise<SkillWithPrerequisite[]>;
  findUserSkills(userId: string): Promise<(UserSkill & { skill: Skill })[]>;
  getSkillProgressStats(userId: string): Promise<SkillProgressStats>;
  upsertUserSkillLevel(userId: string, skillId: string, level: number): Promise<UserSkill>;
  findCosmetics(): Promise<CosmeticItem[]>;
  findCosmeticById(id: string): Promise<CosmeticItem | null>;
  findUserCosmetics(userId: string): Promise<(UserCosmetic & { cosmeticItem: CosmeticItem })[]>;
  unlockEligibleCosmetics(userId: string, level: number): Promise<void>;
  findUserCosmetic(cosmeticKey: { userId: string; cosmeticItemId: string }): Promise<(UserCosmetic & { cosmeticItem: CosmeticItem }) | null>;
  purchaseCosmetic(purchase: { userId: string; cosmeticItemId: string; coinPrice: number; cosmeticName: string }): Promise<UserWithProfile>;
  findMarketplaceListings(query?: { q?: string; rarity?: CosmeticItem["rarity"]; minPriceCoins?: number; maxPriceCoins?: number }): Promise<MarketplaceListingWithDetails[]>;
  findMarketplaceListingById(id: string): Promise<MarketplaceListingWithDetails | null>;
  createMarketplaceListing(listingDraft: { sellerId: string; cosmeticItemId: string; priceCoins: number }): Promise<MarketplaceListingWithDetails>;
  cancelMarketplaceListing(listingKey: { sellerId: string; listingId: string }): Promise<MarketplaceListingWithDetails | null>;
  buyMarketplaceListing(order: { buyerId: string; listingId: string }): Promise<{ listing: MarketplaceListingWithDetails; buyer: UserWithProfile }>;
  equipCosmetic(userId: string, cosmeticItemId: string): Promise<UserWithProfile>;
  equipCharacterClass(userId: string, characterClassId: string): Promise<UserWithProfile>;
}

export class PrismaUserRepository implements IUserRepository {
  async ensureCharacterClasses() {
    await prisma.characterClass.createMany({
      data: builtInCharacterClasses,
      skipDuplicates: true
    });
  }

  async ensureSkills() {
    const existing = await prisma.skill.findMany();
    const existingByName = new Map(existing.map((skill) => [skill.name, skill]));
    const graphIsCurrent = builtInSkills.every((seed) => {
      const skill = existingByName.get(seed.name);
      const prerequisite = seed.prerequisiteName ? existingByName.get(seed.prerequisiteName) : null;

      return (
        skill &&
        skill.description === seed.description &&
        skill.maxLevel === seed.maxLevel &&
        skill.prerequisiteLevel === seed.prerequisiteLevel &&
        skill.prerequisiteSkillId === (prerequisite?.id ?? null)
      );
    });

    if (graphIsCurrent) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const seed of builtInSkills) {
        await tx.skill.upsert({
          where: { name: seed.name },
          create: {
            name: seed.name,
            description: seed.description,
            maxLevel: seed.maxLevel,
            prerequisiteLevel: seed.prerequisiteLevel
          },
          update: {
            description: seed.description,
            maxLevel: seed.maxLevel,
            prerequisiteLevel: seed.prerequisiteLevel
          }
        });
      }

      const synchronized = await tx.skill.findMany({
        where: { name: { in: builtInSkills.map((seed) => seed.name) } }
      });
      const synchronizedByName = new Map(synchronized.map((skill) => [skill.name, skill]));

      for (const seed of builtInSkills) {
        await tx.skill.update({
          where: { name: seed.name },
          data: {
            prerequisiteSkillId: seed.prerequisiteName
              ? synchronizedByName.get(seed.prerequisiteName)?.id ?? null
              : null
          }
        });
      }
    });
  }

  async ensureCosmetics() {
    await prisma.cosmeticItem.createMany({
      data: builtInCosmetics,
      skipDuplicates: true
    });
  }

  fetchUserGraph(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: userInclude
    });
  }

  updateUserIdentity(userId: string, patch: { name?: string; avatarUrl?: string | null }) {
    return prisma.$transaction(async (tx) => {
      if (patch.avatarUrl !== undefined) {
        await tx.userProfile.update({
          where: { userId },
          data: { avatarUrl: patch.avatarUrl }
        });
      }

      if (patch.name !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { name: patch.name }
        });
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: userInclude
      });

      if (!user) {
        throw new AppError("Updated user could not be loaded", 500, "USER_LOAD_FAILED");
      }

      return user;
    });
  }

  async finalizeOnboarding(onboarding: {
    userId: string;
    timezone: string;
    productivityMode: "STUDENT" | "PROFESSIONAL" | "PERSONAL";
    preferredFocusMinutes: number;
    dailyGoalMinutes: number;
    characterClassId?: string;
  }) {
    await prisma.userProfile.update({
      where: { userId: onboarding.userId },
      data: {
        timezone: onboarding.timezone,
        productivityMode: onboarding.productivityMode,
        preferredFocusMinutes: onboarding.preferredFocusMinutes,
        dailyGoalMinutes: onboarding.dailyGoalMinutes,
        selectedCharacterClassId: onboarding.characterClassId,
        onboardingCompletedAt: new Date()
      }
    });

    const user = await this.fetchUserGraph(onboarding.userId);

    if (!user) {
      throw new AppError("Onboarded user could not be loaded", 500, "USER_LOAD_FAILED");
    }

    return user;
  }

  fetchAvailableClasses() {
    return prisma.characterClass.findMany({
      orderBy: { name: "asc" }
    });
  }

  findCharacterClassById(id: string) {
    return prisma.characterClass.findUnique({
      where: { id }
    });
  }

  findSkills() {
    return prisma.skill.findMany({
      include: { prerequisite: true },
      orderBy: { name: "asc" }
    });
  }

  findUserSkills(userId: string) {
    return prisma.userSkill.findMany({
      where: { userId },
      include: { skill: true },
      orderBy: { skill: { name: "asc" } }
    });
  }

  async getSkillProgressStats(userId: string): Promise<SkillProgressStats> {
    const [
      completedQuestCount,
      focusStats,
      profile,
      guildMembershipCount,
      teamQuestContributionCount,
      recoveryQuestCount
    ] = await Promise.all([
      prisma.quest.count({
        where: {
          userId,
          status: "COMPLETED"
        }
      }),
      prisma.focusSession.aggregate({
        where: {
          userId,
          completed: true
        },
        _sum: {
          durationMinutes: true
        }
      }),
      prisma.userProfile.findUnique({
        where: { userId },
        select: { longestStreak: true }
      }),
      prisma.guildMember.count({
        where: { userId }
      }),
      prisma.teamQuestContribution.count({
        where: { userId }
      }),
      prisma.quest.count({
        where: {
          userId,
          difficulty: "RECOVERY",
          status: "COMPLETED"
        }
      })
    ]);

    return {
      completedQuestCount,
      totalFocusMinutes: focusStats._sum.durationMinutes ?? 0,
      longestStreak: profile?.longestStreak ?? 0,
      guildMembershipCount,
      teamQuestContributionCount,
      recoveryQuestCount
    };
  }

  upsertUserSkillLevel(userId: string, skillId: string, level: number) {
    return prisma.$transaction(async (tx) => {
      const skill = await tx.skill.findUnique({
        where: { id: skillId },
        include: { prerequisite: true }
      });

      if (!skill) {
        throw new AppError("Skill not found", 404, "SKILL_NOT_FOUND");
      }

      if (level < 1 || level > skill.maxLevel) {
        throw new AppError("Skill level is outside the allowed range", 400, "INVALID_SKILL_LEVEL");
      }

      if (skill.prerequisiteSkillId) {
        const prerequisiteProgress = await tx.userSkill.findUnique({
          where: {
            userId_skillId: {
              userId,
              skillId: skill.prerequisiteSkillId
            }
          }
        });

        if ((prerequisiteProgress?.level ?? 0) < skill.prerequisiteLevel) {
          throw new AppError(
            `Reach level ${skill.prerequisiteLevel} in ${skill.prerequisite?.name ?? "the prerequisite skill"} first`,
            409,
            "SKILL_PREREQUISITE_NOT_MET"
          );
        }
      }

      return tx.userSkill.upsert({
        where: {
          userId_skillId: {
            userId,
            skillId
          }
        },
        create: {
          userId,
          skillId,
          level
        },
        update: {
          level
        }
      });
    });
  }

  findCosmetics() {
    return prisma.cosmeticItem.findMany({
      orderBy: [{ unlockLevel: "asc" }, { name: "asc" }]
    });
  }

  findCosmeticById(id: string) {
    return prisma.cosmeticItem.findUnique({
      where: { id }
    });
  }

  findUserCosmetics(userId: string) {
    return prisma.userCosmetic.findMany({
      where: { userId },
      include: { cosmeticItem: true },
      orderBy: { unlockedAt: "desc" }
    });
  }

  async unlockEligibleCosmetics(userId: string, level: number) {
    const eligible = await prisma.cosmeticItem.findMany({
      where: {
        unlockLevel: {
          lte: level
        }
      },
      select: { id: true }
    });

    if (eligible.length === 0) {
      return;
    }

    await prisma.userCosmetic.createMany({
      data: eligible.map((cosmetic) => ({
        userId,
        cosmeticItemId: cosmetic.id
      })),
      skipDuplicates: true
    });
  }

  findUserCosmetic(cosmeticKey: { userId: string; cosmeticItemId: string }) {
    return prisma.userCosmetic.findUnique({
      where: {
        userId_cosmeticItemId: {
          userId: cosmeticKey.userId,
          cosmeticItemId: cosmeticKey.cosmeticItemId
        }
      },
      include: { cosmeticItem: true }
    });
  }

  async purchaseCosmetic(purchase: { userId: string; cosmeticItemId: string; coinPrice: number; cosmeticName: string }) {
    return prisma.$transaction(async (tx) => {
      // Keep the decrement atomic so concurrent purchases cannot overspend.
      const profile = await tx.userProfile.update({
        where: { userId: purchase.userId },
        data: { coins: { decrement: purchase.coinPrice } },
        select: { coins: true }
      });

      if (profile.coins < 0) {
        throw new AppError("Insufficient coins", 400, "INSUFFICIENT_COINS");
      }

      await tx.userCosmetic.create({
        data: {
          userId: purchase.userId,
          cosmeticItemId: purchase.cosmeticItemId
        }
      });

      await tx.coinTransaction.create({
        data: {
          userId: purchase.userId,
          type: CoinTransactionType.SPENT,
          amount: purchase.coinPrice,
          reason: `Purchased cosmetic: ${purchase.cosmeticName}`,
          balanceAfter: profile.coins
        }
      });

      const user = await tx.user.findUnique({
        where: { id: purchase.userId },
        include: userInclude
      });

      if (!user) {
        throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
      }

      return user;
    });
  }

  findMarketplaceListings(query: { q?: string; rarity?: CosmeticItem["rarity"]; minPriceCoins?: number; maxPriceCoins?: number } = {}) {
    const search = query.q?.trim();
    const where: Prisma.MarketplaceListingWhereInput = {
      status: MarketplaceListingStatus.ACTIVE,
      ...(query.rarity ? { cosmeticItem: { is: { rarity: query.rarity } } } : {}),
      ...(query.minPriceCoins !== undefined || query.maxPriceCoins !== undefined
        ? {
            priceCoins: {
              ...(query.minPriceCoins !== undefined ? { gte: query.minPriceCoins } : {}),
              ...(query.maxPriceCoins !== undefined ? { lte: query.maxPriceCoins } : {})
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              { cosmeticItem: { is: { name: { contains: search, mode: "insensitive" } } } },
              { cosmeticItem: { is: { description: { contains: search, mode: "insensitive" } } } },
              { seller: { is: { name: { contains: search, mode: "insensitive" } } } }
            ]
          }
        : {})
    };

    return prisma.marketplaceListing.findMany({
      where,
      include: listingInclude,
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  findMarketplaceListingById(id: string) {
    return prisma.marketplaceListing.findUnique({
      where: { id },
      include: listingInclude
    });
  }

  async createMarketplaceListing(listingDraft: { sellerId: string; cosmeticItemId: string; priceCoins: number }) {
    return prisma.marketplaceListing.create({
      data: {
        sellerId: listingDraft.sellerId,
        cosmeticItemId: listingDraft.cosmeticItemId,
        priceCoins: listingDraft.priceCoins
      },
      include: listingInclude
    });
  }

  async cancelMarketplaceListing(listingKey: { sellerId: string; listingId: string }) {
    try {
      return await prisma.marketplaceListing.update({
        where: {
          id: listingKey.listingId,
          sellerId: listingKey.sellerId,
          status: MarketplaceListingStatus.ACTIVE
        },
        data: {
          status: MarketplaceListingStatus.CANCELLED,
          cancelledAt: new Date()
        },
        include: listingInclude
      });
    } catch {
      return null;
    }
  }

  async buyMarketplaceListing(order: { buyerId: string; listingId: string }) {
    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: order.listingId },
        include: listingInclude
      });

      if (!listing || listing.status !== MarketplaceListingStatus.ACTIVE) {
        throw new AppError("Marketplace listing is not active", 409, "MARKETPLACE_LISTING_NOT_ACTIVE");
      }

      const [seller, owned] = await Promise.all([
        tx.userProfile.findUnique({ where: { userId: listing.sellerId }, select: { selectedCosmeticId: true } }),
        tx.userCosmetic.findUnique({
          where: {
            userId_cosmeticItemId: {
              userId: order.buyerId,
              cosmeticItemId: listing.cosmeticItemId
            }
          }
        })
      ]);

      if (!seller) {
        throw new AppError("Seller profile not found", 404, "MARKETPLACE_PROFILE_NOT_FOUND");
      }

      if (owned) {
        throw new AppError("You already own this item", 409, "MARKETPLACE_BUYER_ALREADY_OWNS");
      }

      const buyerBalance = await tx.userProfile.update({
        where: { userId: order.buyerId },
        data: { coins: { decrement: listing.priceCoins } },
        select: { coins: true }
      });

      if (buyerBalance.coins < 0) {
        throw new AppError("Insufficient coins", 400, "MARKETPLACE_INSUFFICIENT_COINS");
      }

      const sellerBalance = await tx.userProfile.update({
        where: { userId: listing.sellerId },
        data: { coins: { increment: listing.priceCoins } },
        select: { coins: true }
      });

      await tx.userCosmetic.update({
        where: {
          userId_cosmeticItemId: {
            userId: listing.sellerId,
            cosmeticItemId: listing.cosmeticItemId
          }
        },
        data: { userId: order.buyerId }
      });

      if (seller.selectedCosmeticId === listing.cosmeticItemId) {
        await tx.userProfile.update({
          where: { userId: listing.sellerId },
          data: { selectedCosmeticId: null }
        });
      }

      await tx.coinTransaction.create({
        data: {
          userId: order.buyerId,
          type: CoinTransactionType.SPENT,
          amount: listing.priceCoins,
          reason: `Marketplace purchase: ${listing.cosmeticItem.name}`,
          balanceAfter: buyerBalance.coins
        }
      });
      await tx.coinTransaction.create({
        data: {
          userId: listing.sellerId,
          type: CoinTransactionType.EARNED,
          amount: listing.priceCoins,
          reason: `Marketplace sale: ${listing.cosmeticItem.name}`,
          balanceAfter: sellerBalance.coins
        }
      });

      const sold = await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          buyerId: order.buyerId,
          status: MarketplaceListingStatus.SOLD,
          soldAt: new Date()
        },
        include: listingInclude
      });
      const buyer = await tx.user.findUnique({
        where: { id: order.buyerId },
        include: userInclude
      });

      if (!buyer) {
        throw new AppError("Marketplace buyer could not be loaded", 500, "BUYER_LOAD_FAILED");
      }

      return { listing: sold, buyer };
    });
  }

  async equipCosmetic(userId: string, cosmeticItemId: string) {
    await prisma.userProfile.update({
      where: { userId },
      data: { selectedCosmeticId: cosmeticItemId }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: userInclude
    });

    if (!user) {
      throw new AppError("User with selected cosmetic could not be loaded", 500, "USER_LOAD_FAILED");
    }

    return user;
  }

  async equipCharacterClass(userId: string, characterClassId: string) {
    await prisma.userProfile.update({
      where: { userId },
      data: { selectedCharacterClassId: characterClassId }
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: userInclude
    });

    if (!user) {
      throw new AppError("User with selected character class could not be loaded", 500, "USER_LOAD_FAILED");
    }

    return user;
  }
}
