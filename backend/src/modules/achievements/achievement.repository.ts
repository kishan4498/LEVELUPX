import { CoinTransactionType, Prisma, type Achievement, type UserAchievement, type UserProfile } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { prisma } from "../../prisma/client.js";
import { builtInAchievements } from "./achievement.seed.js";
import type { AchievementProgressStats } from "./achievement.types.js";

export type UserAchievementRecord = UserAchievement & {
  achievement: Achievement;
};

export type AchievementUnlockRecord = {
  achievements: UserAchievementRecord[];
  profile: Pick<UserProfile, "level" | "totalXp" | "coins"> | null;
};

export interface IAchievementRepository {
  ensureBuiltIns(): Promise<void>;
  findAll(): Promise<Achievement[]>;
  findForUser(userId: string): Promise<UserAchievementRecord[]>;
  getProgressStats(userId: string): Promise<AchievementProgressStats>;
  unlockMany(userId: string, achievementIds: string[]): Promise<AchievementUnlockRecord>;
}

export class PrismaAchievementRepository implements IAchievementRepository {
  async ensureBuiltIns() {
    await prisma.achievement.createMany({
      data: builtInAchievements,
      skipDuplicates: true
    });
  }

  findAll() {
    return prisma.achievement.findMany({
      orderBy: [{ rarity: "asc" }, { conditionValue: "asc" }]
    });
  }

  findForUser(userId: string) {
    return prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" }
    });
  }

  async getProgressStats(userId: string): Promise<AchievementProgressStats> {
    const [completed, profile, focus] = await Promise.all([
      prisma.questCompletion.count({
        where: { userId }
      }),
      prisma.userProfile.findUnique({
        where: { userId },
        select: { totalXp: true }
      }),
      prisma.focusSession.aggregate({
        where: {
          userId,
          completed: true
        },
        _sum: {
          durationMinutes: true
        }
      })
    ]);

    return {
      completedQuestCount: completed,
      totalXp: profile?.totalXp ?? 0,
      totalFocusMinutes: focus._sum.durationMinutes ?? 0
    };
  }

  async unlockMany(userId: string, achievementIds: string[]): Promise<AchievementUnlockRecord> {
    if (achievementIds.length === 0) {
      return {
        achievements: [],
        profile: null
      };
    }

    return prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.findUnique({
        where: { userId }
      });

      if (!profile) {
        throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
      }

      const unlocked: UserAchievementRecord[] = [];
      let totalXp = profile.totalXp;
      let coins = profile.coins;

      for (const id of achievementIds) {
        try {
          const earned = await tx.userAchievement.create({
            data: {
              userId,
              achievementId: id
            },
            include: { achievement: true }
          });

          unlocked.push(earned);
          totalXp += earned.achievement.xpBonus;
          coins += earned.achievement.coinBonus;

          if (earned.achievement.xpBonus > 0) {
            await tx.xpTransaction.create({
              data: {
                userId,
                sourceType: "ACHIEVEMENT",
                sourceId: earned.achievementId,
                amount: earned.achievement.xpBonus,
                multiplier: 1,
                reason: `Unlocked achievement: ${earned.achievement.title}`
              }
            });
          }

          if (earned.achievement.coinBonus > 0) {
            await tx.coinTransaction.create({
              data: {
                userId,
                type: CoinTransactionType.BONUS,
                amount: earned.achievement.coinBonus,
                reason: `Unlocked achievement: ${earned.achievement.title}`,
                balanceAfter: coins
              }
            });
          }
        } catch (error) {
          this.ignoreDuplicateUnlock(error);
        }
      }

      const updated =
        unlocked.length > 0
          ? await tx.userProfile.update({
              where: { userId },
              data: {
                totalXp,
                coins,
                level: Math.floor(totalXp / 1000) + 1
              },
              select: {
                level: true,
                totalXp: true,
                coins: true
              }
            })
          : {
              level: profile.level,
              totalXp: profile.totalXp,
              coins: profile.coins
            };

      return {
        achievements: unlocked.sort((left, right) => right.unlockedAt.getTime() - left.unlockedAt.getTime()),
        profile: updated
      };
    });
  }

  private ignoreDuplicateUnlock(error: unknown) {
    // A concurrent completion may have unlocked this achievement first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }

    throw error;
  }
}
