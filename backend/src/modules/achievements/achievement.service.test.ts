import { AchievementRarity, type Achievement } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { IAchievementRepository, UserAchievementRecord } from "./achievement.repository.js";
import { AchievementService } from "./achievement.service.js";

function makeAchievement(seed: Partial<Achievement> & Pick<Achievement, "id" | "title" | "conditionType" | "conditionValue">): Achievement {
  return {
    description: `${seed.title} description`,
    xpBonus: 25,
    coinBonus: 5,
    rarity: AchievementRarity.COMMON,
    ...seed
  };
}

describe("AchievementService", () => {
  it("unlocks only newly earned achievements and returns the paid profile", async () => {
    const achievements = [
      makeAchievement({
        id: "already-unlocked",
        title: "Already Unlocked",
        conditionType: "QUESTS_COMPLETED",
        conditionValue: 1
      }),
      makeAchievement({
        id: "new-unlock",
        title: "New Unlock",
        conditionType: "QUESTS_COMPLETED",
        conditionValue: 3,
        xpBonus: 75,
        coinBonus: 15
      }),
      makeAchievement({
        id: "not-yet",
        title: "Not Yet",
        conditionType: "QUESTS_COMPLETED",
        conditionValue: 10
      })
    ];
    const unlock: UserAchievementRecord = {
      id: "user-achievement-2",
      userId: "user-1",
      achievementId: "new-unlock",
      unlockedAt: new Date("2026-05-20T00:00:00.000Z"),
      achievement: achievements[1]
    };
    let requestedIds: string[] = [];

    const repo: IAchievementRepository = {
      async ensureBuiltIns() {},
      async findAll() {
        return achievements;
      },
      async findForUser() {
        return [
          {
            id: "user-achievement-1",
            userId: "user-1",
            achievementId: "already-unlocked",
            achievement: achievements[0],
            unlockedAt: new Date("2026-05-19T00:00:00.000Z")
          }
        ];
      },
      async getProgressStats() {
        return {
          completedQuestCount: 3,
          totalXp: 300,
          totalFocusMinutes: 0
        };
      },
      async unlockMany(_userId, achievementIds) {
        requestedIds = achievementIds;

        return {
          achievements: [unlock],
          profile: {
            level: 1,
            totalXp: 375,
            coins: 20
          }
        };
      }
    };

    const unlocks = await new AchievementService(repo).processQuestCompletionUnlocks("user-1");

    expect(requestedIds).toEqual(["new-unlock"]);
    expect(unlocks.profile).toEqual({
      level: 1,
      totalXp: 375,
      coins: 20
    });
    expect(unlocks.achievements).toEqual([
      {
        id: "new-unlock",
        title: "New Unlock",
        description: "New Unlock description",
        conditionType: "QUESTS_COMPLETED",
        conditionValue: 3,
        xpBonus: 75,
        coinBonus: 15,
        rarity: AchievementRarity.COMMON,
        unlockedAt: "2026-05-20T00:00:00.000Z"
      }
    ]);
  });
});
