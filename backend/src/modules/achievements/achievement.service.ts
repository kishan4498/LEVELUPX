import type { Achievement } from "@prisma/client";

import type { IAchievementRepository, UserAchievementRecord } from "./achievement.repository.js";
import type {
  AchievementProgressStats,
  AchievementProgressResponseDto,
  AchievementResponseDto,
  AchievementUnlockResponseDto,
  UserAchievementResponseDto
} from "./achievement.types.js";

export class AchievementService {
  constructor(private readonly repo: IAchievementRepository) {}

  async fetchCatalog(): Promise<AchievementResponseDto[]> {
    await this.repo.ensureBuiltIns();
    const catalog = await this.repo.findAll();
    return catalog.map((achievement) => this.toAchievementDto(achievement));
  }

  async fetchEarnedAchievements(userId: string): Promise<UserAchievementResponseDto[]> {
    await this.repo.ensureBuiltIns();
    const earned = await this.repo.findForUser(userId);
    return earned.map((achievement) => this.toUserAchievementDto(achievement));
  }

  async fetchAchievementProgress(userId: string): Promise<AchievementProgressResponseDto[]> {
    await this.repo.ensureBuiltIns();
    const [catalog, earned, stats] = await Promise.all([
      this.repo.findAll(),
      this.repo.findForUser(userId),
      this.repo.getProgressStats(userId)
    ]);
    const earnedById = new Map(earned.map((unlock) => [unlock.achievementId, unlock]));

    return catalog.map((achievement) => {
      const currentValue = this.getCurrentValue(achievement, stats);
      const unlocked = earnedById.get(achievement.id);

      // Calculate on read so new built-ins also show correct progress for existing users.
      return {
        ...this.toAchievementDto(achievement),
        currentValue,
        progressPercent:
          achievement.conditionValue > 0 ? Math.min(100, Math.round((currentValue / achievement.conditionValue) * 100)) : 0,
        unlocked: !!unlocked,
        unlockedAt: unlocked?.unlockedAt.toISOString() ?? null
      };
    });
  }

  async processQuestCompletionUnlocks(userId: string): Promise<AchievementUnlockResponseDto> {
    await this.repo.ensureBuiltIns();

    const [catalog, earned, stats] = await Promise.all([
      this.repo.findAll(),
      this.repo.findForUser(userId),
      this.repo.getProgressStats(userId)
    ]);

    const unlockedIds = new Set(earned.map((unlock) => unlock.achievementId));
    const pending = catalog.filter(
      (achievement) => !unlockedIds.has(achievement.id) && this.isConditionMet(achievement, stats)
    );

    // The repository records the unlock and its payout in one transaction.
    const unlocked = await this.repo.unlockMany(
      userId,
      pending.map((achievement) => achievement.id)
    );

    return {
      achievements: unlocked.achievements.map((achievement) => this.toUserAchievementDto(achievement)),
      profile: unlocked.profile
    };
  }

  private isConditionMet(achievement: Achievement, stats: AchievementProgressStats) {
    switch (achievement.conditionType) {
      case "QUESTS_COMPLETED":
        return stats.completedQuestCount >= achievement.conditionValue;
      case "TOTAL_XP":
        return stats.totalXp >= achievement.conditionValue;
      case "FOCUS_MINUTES":
        return stats.totalFocusMinutes >= achievement.conditionValue;
      default:
        return false;
    }
  }

  private getCurrentValue(achievement: Achievement, stats: AchievementProgressStats) {
    switch (achievement.conditionType) {
      case "QUESTS_COMPLETED":
        return stats.completedQuestCount;
      case "TOTAL_XP":
        return stats.totalXp;
      case "FOCUS_MINUTES":
        return stats.totalFocusMinutes;
      default:
        return 0;
    }
  }

  private toAchievementDto(achievement: Achievement): AchievementResponseDto {
    return {
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      conditionType: achievement.conditionType,
      conditionValue: achievement.conditionValue,
      xpBonus: achievement.xpBonus,
      coinBonus: achievement.coinBonus,
      rarity: achievement.rarity
    };
  }

  private toUserAchievementDto(userAchievement: UserAchievementRecord): UserAchievementResponseDto {
    return {
      ...this.toAchievementDto(userAchievement.achievement),
      unlockedAt: userAchievement.unlockedAt.toISOString()
    };
  }
}
