import type { CharacterClass, CosmeticItem, Skill, UserCosmetic } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { cosmeticCoinPrice } from "./cosmeticPricing.js";
import type {
  IUserRepository,
  MarketplaceListingWithDetails,
  SkillProgressStats,
  SkillWithPrerequisite,
  UserWithProfile
} from "./user.repository.js";
import type {
  ClassDto,
  OnboardInput,
  SkinDto,
  ListingInput,
  ListingQuery,
  ListingDto,
  SelectClassInput,
  SelectSkinInput,
  BuySkinInput,
  SkillDto,
  UpdateMeInput,
  MeDto,
  ProfileDto
} from "./user.types.js";

export class UserService {
  constructor(private readonly repo: IUserRepository) {}

  async getMe(userId: string): Promise<MeDto> {
    await this.repo.ensureCharacterClasses();
    const user = await this.repo.fetchUserGraph(userId);

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    return this.toDto(user);
  }

  async updateUserIdentity(userId: string, patch: UpdateMeInput): Promise<MeDto> {
    const user = await this.repo.updateUserIdentity(userId, patch);
    return this.toDto(user);
  }

  async finalizeOnboarding(userId: string, onboarding: OnboardInput): Promise<MeDto> {
    try {
      new Intl.DateTimeFormat("en", { timeZone: onboarding.timezone }).format();
    } catch {
      throw new AppError("Choose a valid timezone", 400, "INVALID_TIMEZONE");
    }

    if (onboarding.characterClassId) {
      await this.repo.ensureCharacterClasses();
      const characterClass = await this.repo.findCharacterClassById(onboarding.characterClassId);

      if (!characterClass) {
        throw new AppError("Character class not found", 404, "CHARACTER_CLASS_NOT_FOUND");
      }
    }

    const user = await this.repo.finalizeOnboarding({
      userId,
      ...onboarding
    });

    return this.toDto(user);
  }

  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.repo.fetchUserGraph(userId);

    if (!user?.profile) {
      throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
    }

    return this.toProfile(user.profile);
  }

  async listCharacterClasses(): Promise<ClassDto[]> {
    await this.repo.ensureCharacterClasses();
    const classes = await this.repo.fetchAvailableClasses();
    return classes.map((c) => this.toClassDto(c));
  }

  async listCosmetics(userId: string): Promise<SkinDto[]> {
    await this.repo.ensureCosmetics();
    const user = await this.repo.fetchUserGraph(userId);

    if (!user?.profile) {
      throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
    }

    await this.repo.unlockEligibleCosmetics(userId, user.profile.level);
    const [cosmetics, userCosmetics] = await Promise.all([
      this.repo.findCosmetics(),
      this.repo.findUserCosmetics(userId)
    ]);
    const ownedById = new Map(userCosmetics.map((uc) => [uc.cosmeticItemId, uc]));

    return cosmetics.map((cosmetic) => {
      const uc = ownedById.get(cosmetic.id) ?? null;

      return this.toSkinDto(cosmetic, {
        selectedCosmeticId: user.profile?.selectedCosmeticId ?? null,
        userCosmetic: uc
      });
    });
  }

  async listSkills(userId: string): Promise<SkillDto[]> {
    await this.repo.ensureSkills();
    const [skills, userSkills, stats] = await Promise.all([
      this.repo.findSkills(),
      this.repo.findUserSkills(userId),
      this.repo.getSkillProgressStats(userId)
    ]);
    const savedBySkill = new Map(userSkills.map((saved) => [saved.skillId, saved]));
    const skillById = new Map(skills.map((skill) => [skill.id, skill]));
    const progressBySkill = new Map(skills.map((skill) => [skill.id, this.skillProgress(skill, stats)]));
    const candidateLevelBySkill = new Map(
      skills.map((skill) => {
        const saved = savedBySkill.get(skill.id);
        const progress = progressBySkill.get(skill.id)!;
        return [skill.id, Math.min(skill.maxLevel, Math.max(saved?.level ?? 0, progress.level))] as const;
      })
    );
    const effectiveLevelBySkill = new Map<string, number>();
    const resolving = new Set<string>();

    const resolveLevel = (skillId: string): number => {
      const resolved = effectiveLevelBySkill.get(skillId);

      if (resolved !== undefined) {
        return resolved;
      }

      const skill = skillById.get(skillId);

      if (!skill || resolving.has(skillId)) {
        return 0;
      }

      resolving.add(skillId);
      const prerequisiteLevel = skill.prerequisiteSkillId
        ? resolveLevel(skill.prerequisiteSkillId)
        : Number.POSITIVE_INFINITY;
      resolving.delete(skillId);

      const level =
        skill.prerequisiteSkillId && prerequisiteLevel < skill.prerequisiteLevel
          ? 0
          : candidateLevelBySkill.get(skillId) ?? 0;
      effectiveLevelBySkill.set(skillId, level);
      return level;
    };

    for (const skill of skills) {
      resolveLevel(skill.id);
    }

    // Persist prerequisites before their dependants so repository-level guards
    // also hold when a tree node becomes eligible during this request.
    const persistenceOrder: SkillWithPrerequisite[] = [];
    const visited = new Set<string>();
    const visit = (skill: SkillWithPrerequisite) => {
      if (visited.has(skill.id)) {
        return;
      }

      visited.add(skill.id);
      const prerequisite = skill.prerequisiteSkillId
        ? skillById.get(skill.prerequisiteSkillId)
        : undefined;

      if (prerequisite) {
        visit(prerequisite);
      }

      persistenceOrder.push(skill);
    };

    skills.forEach(visit);

    for (const skill of persistenceOrder) {
      const saved = savedBySkill.get(skill.id);
      const currentLevel = effectiveLevelBySkill.get(skill.id) ?? 0;

      if (currentLevel > 0 && currentLevel !== saved?.level) {
        await this.repo.upsertUserSkillLevel(userId, skill.id, currentLevel);
      }
    }

    return skills.map((skill) => {
      const progress = progressBySkill.get(skill.id)!;
      const currentLevel = effectiveLevelBySkill.get(skill.id) ?? 0;
      const prerequisiteCurrentLevel = skill.prerequisiteSkillId
        ? effectiveLevelBySkill.get(skill.prerequisiteSkillId) ?? 0
        : null;
      const locked =
        prerequisiteCurrentLevel !== null && prerequisiteCurrentLevel < skill.prerequisiteLevel;

      return {
        ...this.toSkillDto(skill),
        currentLevel,
        unlocked: currentLevel > 0,
        locked,
        lockedReason: locked
          ? `Reach level ${skill.prerequisiteLevel} in ${skill.prerequisite?.name ?? "the prerequisite skill"} first`
          : null,
        prerequisite: skill.prerequisite
          ? {
              skillId: skill.prerequisite.id,
              name: skill.prerequisite.name,
              minimumLevel: skill.prerequisiteLevel,
              currentLevel: prerequisiteCurrentLevel ?? 0,
              satisfied: !locked
            }
          : null,
        currentValue: progress.currentValue,
        nextLevelTarget: this.nextLevelTarget(progress.thresholds, currentLevel, skill.maxLevel),
        progressPercent: this.skillProgressPercent(progress.thresholds, currentLevel, skill.maxLevel, progress.currentValue),
        ruleLabel: progress.ruleLabel
      };
    });
  }

  async equipCharacterClass(userId: string, selection: SelectClassInput): Promise<ProfileDto> {
    await this.repo.ensureCharacterClasses();
    const characterClass = await this.repo.findCharacterClassById(selection.characterClassId);

    if (!characterClass) {
      throw new AppError("Character class not found", 404, "CHARACTER_CLASS_NOT_FOUND");
    }

    const user = await this.repo.equipCharacterClass(userId, selection.characterClassId);

    if (!user.profile) {
      throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
    }

    return this.toProfile(user.profile);
  }

  async equipCosmetic(userId: string, selection: SelectSkinInput): Promise<ProfileDto> {
    await this.repo.ensureCosmetics();
    const owned = await this.repo.findUserCosmetic({
      userId,
      cosmeticItemId: selection.cosmeticItemId
    });

    if (!owned) {
      throw new AppError("Cosmetic item is not owned", 403, "COSMETIC_NOT_OWNED");
    }

    const user = await this.repo.equipCosmetic(userId, selection.cosmeticItemId);

    if (!user.profile) {
      throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
    }

    return this.toProfile(user.profile);
  }

  async purchaseCosmetic(userId: string, purchase: BuySkinInput): Promise<ProfileDto> {
    await this.repo.ensureCosmetics();
    const [user, cosmetic, ownership] = await Promise.all([
      this.repo.fetchUserGraph(userId),
      this.repo.findCosmeticById(purchase.cosmeticItemId),
      this.repo.findUserCosmetic({
        userId,
        cosmeticItemId: purchase.cosmeticItemId
      })
    ]);

    if (!user?.profile) {
      throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
    }

    if (!cosmetic) {
      throw new AppError("Cosmetic item not found", 404, "COSMETIC_NOT_FOUND");
    }

    if (ownership) {
      throw new AppError("Cosmetic item is already owned", 409, "COSMETIC_ALREADY_OWNED");
    }

    const price = cosmeticCoinPrice(cosmetic);

    if (user.profile.coins < price) {
      throw new AppError("Not enough coins to purchase this cosmetic", 400, "INSUFFICIENT_COINS");
    }

    const updated = await this.repo.purchaseCosmetic({
      userId,
      cosmeticItemId: cosmetic.id,
      coinPrice: price,
      cosmeticName: cosmetic.name
    });

    if (!updated.profile) {
      throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
    }

    return this.toProfile(updated.profile);
  }

  async listMarketplaceListings(query: ListingQuery = {}): Promise<ListingDto[]> {
    const listings = await this.repo.findMarketplaceListings(query);
    return listings.map((listing) => this.toListingDto(listing));
  }

  async createMarketplaceListing(userId: string, listingDraft: ListingInput): Promise<ListingDto> {
    await this.repo.ensureCosmetics();
    const owned = await this.repo.findUserCosmetic({
      userId,
      cosmeticItemId: listingDraft.cosmeticItemId
    });

    if (!owned) {
      throw new AppError("Cosmetic item is not owned", 403, "COSMETIC_NOT_OWNED");
    }

    const active = await this.repo.findMarketplaceListings();
    const alreadyListed = active.some(
      (listing) => listing.sellerId === userId && listing.cosmeticItemId === listingDraft.cosmeticItemId
    );

    if (alreadyListed) {
      throw new AppError("Cosmetic item is already listed", 409, "MARKETPLACE_ALREADY_LISTED");
    }

    const listing = await this.repo.createMarketplaceListing({
      sellerId: userId,
      cosmeticItemId: listingDraft.cosmeticItemId,
      priceCoins: listingDraft.priceCoins
    });

    return this.toListingDto(listing);
  }

  async cancelMarketplaceListing(userId: string, listingId: string): Promise<ListingDto> {
    const listing = await this.repo.cancelMarketplaceListing({ sellerId: userId, listingId });

    if (!listing) {
      throw new AppError("Marketplace listing not found", 404, "MARKETPLACE_LISTING_NOT_FOUND");
    }

    return this.toListingDto(listing);
  }

  async buyMarketplaceListing(userId: string, listingId: string): Promise<{ listing: ListingDto; profile: ProfileDto }> {
    const listing = await this.repo.findMarketplaceListingById(listingId);

    if (!listing || listing.status !== "ACTIVE") {
      throw new AppError("Marketplace listing is not active", 404, "MARKETPLACE_LISTING_NOT_ACTIVE");
    }

    if (listing.sellerId === userId) {
      throw new AppError("You cannot buy your own marketplace listing", 409, "MARKETPLACE_SELF_PURCHASE");
    }

    try {
      const purchase = await this.repo.buyMarketplaceListing({ buyerId: userId, listingId });

      if (!purchase.buyer.profile) {
        throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
      }

      return {
        listing: this.toListingDto(purchase.listing),
        profile: this.toProfile(purchase.buyer.profile)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (message === "MARKETPLACE_INSUFFICIENT_COINS") {
        throw new AppError("Not enough coins to buy this marketplace listing", 400, "INSUFFICIENT_COINS");
      }

      if (message === "MARKETPLACE_BUYER_ALREADY_OWNS") {
        throw new AppError("Cosmetic item is already owned", 409, "COSMETIC_ALREADY_OWNED");
      }

      if (message === "MARKETPLACE_LISTING_NOT_ACTIVE") {
        throw new AppError("Marketplace listing is not active", 404, "MARKETPLACE_LISTING_NOT_ACTIVE");
      }

      throw error;
    }
  }

  private toDto(user: UserWithProfile): MeDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      profile: user.profile ? this.toProfile(user.profile) : null
    };
  }

  private toProfile(profile: NonNullable<UserWithProfile["profile"]>): ProfileDto {
    return {
      id: profile.id,
      avatarUrl: profile.avatarUrl,
      level: profile.level,
      totalXp: profile.totalXp,
      coins: profile.coins,
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      timezone: profile.timezone,
      productivityMode: profile.productivityMode,
      preferredFocusMinutes: profile.preferredFocusMinutes,
      dailyGoalMinutes: profile.dailyGoalMinutes,
      onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
      selectedCharacterClass: profile.selectedCharacterClass
        ? this.toClassDto(profile.selectedCharacterClass)
        : null,
      selectedCosmetic: profile.selectedCosmetic
        ? this.toSkinDto(profile.selectedCosmetic, {
            selectedCosmeticId: profile.selectedCosmeticId,
            userCosmetic: null,
            forceOwned: true
          })
        : null
    };
  }

  private toClassDto(characterClass: CharacterClass): ClassDto {
    return {
      id: characterClass.id,
      name: characterClass.name,
      description: characterClass.description,
      baseXpMultiplier: characterClass.baseXpMultiplier
    };
  }

  private toSkillDto(
    skill: Skill
  ): Omit<
    SkillDto,
    | "currentLevel"
    | "unlocked"
    | "locked"
    | "lockedReason"
    | "prerequisite"
    | "currentValue"
    | "nextLevelTarget"
    | "progressPercent"
    | "ruleLabel"
  > {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      maxLevel: skill.maxLevel
    };
  }

  private toSkinDto(
    cosmetic: CosmeticItem,
    skinState: {
      selectedCosmeticId: string | null;
      userCosmetic: (UserCosmetic & { cosmeticItem: CosmeticItem }) | null;
      forceOwned?: boolean;
    }
  ): SkinDto {
    const owned = skinState.forceOwned === true || Boolean(skinState.userCosmetic);

    return {
      id: cosmetic.id,
      name: cosmetic.name,
      description: cosmetic.description,
      slot: cosmetic.slot,
      rarity: cosmetic.rarity,
      unlockLevel: cosmetic.unlockLevel,
      coinPrice: cosmeticCoinPrice(cosmetic),
      owned,
      selected: skinState.selectedCosmeticId === cosmetic.id,
      unlockedAt: skinState.userCosmetic?.unlockedAt.toISOString() ?? null
    };
  }

  private toListingDto(listing: MarketplaceListingWithDetails): ListingDto {
    return {
      id: listing.id,
      sellerId: listing.sellerId,
      sellerName: listing.seller.name,
      cosmetic: {
        id: listing.cosmeticItem.id,
        name: listing.cosmeticItem.name,
        description: listing.cosmeticItem.description,
        slot: listing.cosmeticItem.slot,
        rarity: listing.cosmeticItem.rarity,
        unlockLevel: listing.cosmeticItem.unlockLevel,
        coinPrice: cosmeticCoinPrice(listing.cosmeticItem)
      },
      priceCoins: listing.priceCoins,
      status: listing.status,
      createdAt: listing.createdAt.toISOString()
    };
  }

  private skillProgress(skill: Skill, stats: SkillProgressStats) {
    const rule = this.skillRule(skill.name, stats);
    const level = rule.thresholds.filter((target) => rule.currentValue >= target).length;

    return {
      ...rule,
      level: Math.min(skill.maxLevel, level)
    };
  }

  private skillRule(skillName: string, stats: SkillProgressStats) {
    if (skillName === "Deep Focus") {
      return {
        currentValue: stats.totalFocusMinutes,
        thresholds: [60, 180, 420, 900, 1800],
        ruleLabel: "Completed focus minutes"
      };
    }

    if (skillName === "Quest Planning") {
      return {
        currentValue: stats.completedQuestCount,
        thresholds: [1, 5, 15, 35, 75],
        ruleLabel: "Completed quests"
      };
    }

    if (skillName === "Streak Discipline") {
      return {
        currentValue: stats.longestStreak,
        thresholds: [1, 3, 7, 14, 30],
        ruleLabel: "Longest streak days"
      };
    }

    if (skillName === "Guild Support") {
      return {
        currentValue: stats.guildMembershipCount + stats.teamQuestContributionCount,
        thresholds: [1, 3, 7, 15, 30],
        ruleLabel: "Guild memberships and team quest contributions"
      };
    }

    if (skillName === "Recovery Rhythm") {
      return {
        currentValue: stats.recoveryQuestCount,
        thresholds: [1, 3, 7, 14, 30],
        ruleLabel: "Completed recovery quests"
      };
    }

    return {
      currentValue: 0,
      thresholds: [1, 3, 7, 14, 30],
      ruleLabel: "Tracked activity"
    };
  }

  private nextLevelTarget(thresholds: number[], currentLevel: number, maxLevel: number) {
    if (currentLevel >= maxLevel) {
      return null;
    }

    return thresholds[currentLevel] ?? null;
  }

  private skillProgressPercent(thresholds: number[], currentLevel: number, maxLevel: number, currentValue: number) {
    if (currentLevel >= maxLevel) {
      return 100;
    }

    const nextTarget = thresholds[currentLevel];

    if (!nextTarget) {
      return 0;
    }

    const previousTarget = currentLevel === 0 ? 0 : thresholds[currentLevel - 1] ?? 0;
    const gained = currentValue - previousTarget;
    const span = nextTarget - previousTarget;

    return Math.max(0, Math.min(100, Math.round((gained / span) * 100)));
  }

}
