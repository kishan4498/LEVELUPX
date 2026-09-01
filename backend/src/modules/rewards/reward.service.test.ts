import { Difficulty, type EconomySettings } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { IRewardRepository } from "./reward.repository.js";
import { RewardReadService, RewardService } from "./reward.service.js";

function makeSettings(overrides: Partial<EconomySettings> = {}): EconomySettings {
  return {
    id: "settings-1",
    xpMultiplier: 1,
    coinMultiplier: 1,
    dailyCoinLimit: 500,
    maxQuestReward: 1000,
    inflationRate: 0,
    updatedBy: null,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function makeRepo(setup: { settings?: EconomySettings; coinsEarnedToday?: number }): IRewardRepository {
  return {
    getEconomySettings: async () => setup.settings ?? makeSettings(),
    getCoinsEarnedToday: async () => setup.coinsEarnedToday ?? 0,
    getSummary: async () => {
      throw new Error("getSummary is not used by RewardService tests");
    },
    findXpHistory: async () => {
      throw new Error("findXpHistory is not used by RewardService tests");
    },
    findCoinHistory: async () => {
      throw new Error("findCoinHistory is not used by RewardService tests");
    }
  };
}

describe("RewardService", () => {
  it("applies the streak and economy multipliers to difficulty-adjusted stored rewards", async () => {
    const service = new RewardService(
      makeRepo({
        settings: makeSettings({
          xpMultiplier: 1.2,
          coinMultiplier: 1.5
        })
      })
    );

    const reward = await service.computeQuestBounty("user-1", {
      currentStreak: 7,
      quest: {
        difficulty: Difficulty.HARD,
        xpReward: 100,
        coinReward: 40
      }
    });

    expect(reward).toEqual({
      xp: 150,
      coins: 60,
      multiplier: 1.5,
      dailyCoinLimitApplied: false
    });
  });

  it("caps rewards by max quest reward and remaining daily coins", async () => {
    const service = new RewardService(
      makeRepo({
        coinsEarnedToday: 90,
        settings: makeSettings({
          dailyCoinLimit: 100,
          maxQuestReward: 120,
          xpMultiplier: 2,
          coinMultiplier: 3
        })
      })
    );

    const reward = await service.computeQuestBounty("user-1", {
      currentStreak: 30,
      quest: {
        difficulty: Difficulty.BOSS,
        xpReward: 100,
        coinReward: 100
      }
    });

    expect(reward).toEqual({
      xp: 120,
      coins: 10,
      multiplier: 4,
      dailyCoinLimitApplied: true
    });
  });

  it("returns zero coins when the daily coin limit is already exhausted", async () => {
    const service = new RewardService(
      makeRepo({
        coinsEarnedToday: 100,
        settings: makeSettings({
          dailyCoinLimit: 100
        })
      })
    );

    const reward = await service.computeQuestBounty("user-1", {
      currentStreak: 0,
      quest: {
        difficulty: Difficulty.MEDIUM,
        xpReward: 80,
        coinReward: 20
      }
    });

    expect(reward).toEqual({
      xp: 80,
      coins: 0,
      multiplier: 1,
      dailyCoinLimitApplied: true
    });
  });

  it("pays only the remaining daily coins when the limit is partially available", async () => {
    const service = new RewardService(
      makeRepo({
        coinsEarnedToday: 42,
        settings: makeSettings({
          dailyCoinLimit: 50
        })
      })
    );

    const reward = await service.computeQuestBounty("user-1", {
      currentStreak: 0,
      quest: {
        difficulty: Difficulty.HARD,
        xpReward: 60,
        coinReward: 10
      }
    });

    expect(reward).toEqual({
      xp: 60,
      coins: 8,
      multiplier: 1,
      dailyCoinLimitApplied: true
    });
  });

  it("caps XP without marking the daily coin limit when coins are not capped", async () => {
    const service = new RewardService(
      makeRepo({
        settings: makeSettings({
          maxQuestReward: 100,
          dailyCoinLimit: 500
        })
      })
    );

    const reward = await service.computeQuestBounty("user-1", {
      currentStreak: 30,
      quest: {
        difficulty: Difficulty.BOSS,
        xpReward: 100,
        coinReward: 10
      }
    });

    expect(reward).toEqual({
      xp: 100,
      coins: 10,
      multiplier: 2,
      dailyCoinLimitApplied: false
    });
  });

  it("uses the 14-day streak multiplier before the 30-day multiplier", async () => {
    const service = new RewardService(
      makeRepo({
        settings: makeSettings()
      })
    );

    const reward = await service.computeQuestBounty("user-1", {
      currentStreak: 14,
      quest: {
        difficulty: Difficulty.EASY,
        xpReward: 100,
        coinReward: 10
      }
    });

    expect(reward).toEqual({
      xp: 150,
      coins: 10,
      multiplier: 1.5,
      dailyCoinLimitApplied: false
    });
  });

  it("reduces coin issuance by the administrator-configured inflation rate", async () => {
    const service = new RewardService(
      makeRepo({
        settings: makeSettings({
          coinMultiplier: 1.5,
          inflationRate: 20
        })
      })
    );

    const reward = await service.computeQuestBounty("user-1", {
      currentStreak: 0,
      quest: {
        difficulty: Difficulty.HARD,
        xpReward: 100,
        coinReward: 50
      }
    });

    expect(reward).toMatchObject({
      xp: 100,
      coins: 60,
      multiplier: 1
    });
  });
});

describe("RewardReadService", () => {
  it("returns user-facing economy context with remaining daily coins", async () => {
    const service = new RewardReadService(
      makeRepo({
        coinsEarnedToday: 125,
        settings: makeSettings({
          xpMultiplier: 1.5,
          coinMultiplier: 0.75,
          inflationRate: 12,
          dailyCoinLimit: 500,
          maxQuestReward: 900,
          updatedAt: new Date("2026-05-22T12:00:00.000Z")
        })
      })
    );

    await expect(service.fetchEconomyContext("user-1")).resolves.toEqual({
      xpMultiplier: 1.5,
      coinMultiplier: 0.75,
      inflationRate: 12,
      dailyCoinLimit: 500,
      maxQuestReward: 900,
      coinsEarnedToday: 125,
      remainingDailyCoins: 375,
      updatedAt: "2026-05-22T12:00:00.000Z"
    });
  });

  it("exports reward ledger rows as escaped CSV", async () => {
    const service = new RewardReadService({
      ...makeRepo({}),
      async findXpHistory() {
        return [
          {
            id: "xp-1",
            userId: "user-1",
            sourceType: "QUEST",
            sourceId: "quest-1",
            amount: 100,
            multiplier: 1.25,
            reason: 'Completed "Boss" quest',
            createdAt: new Date("2026-05-23T01:00:00.000Z")
          }
        ];
      },
      async findCoinHistory() {
        return [
          {
            id: "coin-1",
            userId: "user-1",
            type: "EARNED",
            amount: 25,
            reason: "Quest reward",
            balanceAfter: 125,
            createdAt: new Date("2026-05-23T01:01:00.000Z")
          }
        ];
      }
    });

    const file = await service.dumpEconomyLedger("user-1");

    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(file.filename).toMatch(/^levelupx-reward-ledger-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.content).toContain('"ledger","date","type","amount","multiplier","balanceAfter","reason"');
    expect(file.content).toContain('"XP","2026-05-23T01:00:00.000Z","QUEST","100","1.25","","Completed ""Boss"" quest"');
    expect(file.content).toContain('"COIN","2026-05-23T01:01:00.000Z","EARNED","25","","125","Quest reward"');
  });
});
