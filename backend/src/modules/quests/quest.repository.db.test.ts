import { CoinTransactionType, Difficulty, QuestStatus, RecurrenceType } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../prisma/client.js";
import { disconnectTestDatabase, isTestDatabaseConfigured, resetTestDatabase } from "../../test/testDatabase.js";
import { PrismaQuestRepository } from "./quest.repository.js";

const describeDb = isTestDatabaseConfigured() ? describe : describe.skip;

describeDb("PrismaQuestRepository.completeWithReward", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it("completes a quest with reward rows and blocks duplicate payout", async () => {
    const repo = new PrismaQuestRepository();
    const { user, quest } = await createStartedQuest();

    const completion = await repo.completeWithReward({
      questId: quest.id,
      userId: user.id,
      reward: {
        xp: 150,
        coins: 12,
        multiplier: 1.5,
        dailyCoinLimitApplied: false
      }
    });

    expect(completion.quest.status).toBe(QuestStatus.COMPLETED);
    expect(completion.profile).toMatchObject({
      totalXp: 1050,
      coins: 52,
      level: 2,
      currentStreak: 1,
      longestStreak: 1
    });

    await expect(
      repo.completeWithReward({
        questId: quest.id,
        userId: user.id,
        reward: {
          xp: 150,
          coins: 12,
          multiplier: 1.5,
          dailyCoinLimitApplied: false
        }
      })
    ).rejects.toMatchObject({
      code: "QUEST_NOT_COMPLETABLE",
      statusCode: 409
    });

    const [completionCount, xpTransactions, coinTransactions, profile] = await Promise.all([
      prisma.questCompletion.count({ where: { questId: quest.id, userId: user.id } }),
      prisma.xpTransaction.findMany({ where: { userId: user.id, sourceId: quest.id } }),
      prisma.coinTransaction.findMany({ where: { userId: user.id } }),
      prisma.userProfile.findUnique({ where: { userId: user.id } })
    ]);

    expect(completionCount).toBe(1);
    expect(xpTransactions).toHaveLength(1);
    expect(xpTransactions[0]).toMatchObject({
      sourceType: "QUEST",
      sourceId: quest.id,
      amount: 150,
      multiplier: 1.5,
      reason: "Completed quest: Complete transaction quest"
    });
    expect(coinTransactions).toHaveLength(1);
    expect(coinTransactions[0]).toMatchObject({
      type: CoinTransactionType.EARNED,
      amount: 12,
      reason: "Completed quest: Complete transaction quest",
      balanceAfter: 52
    });
    expect(profile).toMatchObject({
      totalXp: 1050,
      coins: 52,
      level: 2,
      currentStreak: 1,
      longestStreak: 1
    });
  });

  it("awards one payout when duplicate completion requests arrive concurrently", async () => {
    const repo = new PrismaQuestRepository();
    const { user, quest } = await createStartedQuest();
    const reward = {
      xp: 150,
      coins: 12,
      multiplier: 1.5,
      dailyCoinLimitApplied: false
    };

    const outcomes = await Promise.allSettled([
      repo.completeWithReward({ questId: quest.id, userId: user.id, reward }),
      repo.completeWithReward({ questId: quest.id, userId: user.id, reward })
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          code: "QUEST_NOT_COMPLETABLE",
          statusCode: 409
        })
      })
    ]);

    const [completionCount, xpTransactionCount, coinTransactionCount, profile] = await Promise.all([
      prisma.questCompletion.count({ where: { questId: quest.id } }),
      prisma.xpTransaction.count({ where: { sourceType: "QUEST", sourceId: quest.id } }),
      prisma.coinTransaction.count({ where: { userId: user.id } }),
      prisma.userProfile.findUniqueOrThrow({ where: { userId: user.id } })
    ]);

    expect({ completionCount, xpTransactionCount, coinTransactionCount }).toEqual({
      completionCount: 1,
      xpTransactionCount: 1,
      coinTransactionCount: 1
    });
    expect(profile).toMatchObject({ totalXp: 1050, coins: 52, level: 2, currentStreak: 1, longestStreak: 1 });
  });

  it("updates a UTC completion streak once per day, increments continuity, resets gaps, and preserves the longest", async () => {
    const repo = new PrismaQuestRepository();
    const { user, quest: firstQuest } = await createStartedQuest();
    await prisma.userProfile.update({
      where: { userId: user.id },
      data: { currentStreak: 4, longestStreak: 10 }
    });
    const reward = {
      xp: 10,
      coins: 1,
      multiplier: 1,
      dailyCoinLimitApplied: false
    };

    const first = await repo.completeWithReward({
      questId: firstQuest.id,
      userId: user.id,
      reward,
      completedAt: new Date("2026-08-10T08:00:00.000Z")
    });
    expect(first.profile).toMatchObject({ currentStreak: 1, longestStreak: 10 });

    const sameDayQuest = await createStartedQuestForUser(user.id, "Same UTC day quest");
    const sameDay = await repo.completeWithReward({
      questId: sameDayQuest.id,
      userId: user.id,
      reward,
      completedAt: new Date("2026-08-10T23:59:00.000Z")
    });
    expect(sameDay.profile).toMatchObject({ currentStreak: 1, longestStreak: 10 });

    const nextDayQuest = await createStartedQuestForUser(user.id, "Next UTC day quest");
    const nextDay = await repo.completeWithReward({
      questId: nextDayQuest.id,
      userId: user.id,
      reward,
      completedAt: new Date("2026-08-11T00:01:00.000Z")
    });
    expect(nextDay.profile).toMatchObject({ currentStreak: 2, longestStreak: 10 });

    const afterGapQuest = await createStartedQuestForUser(user.id, "Quest after a gap");
    const afterGap = await repo.completeWithReward({
      questId: afterGapQuest.id,
      userId: user.id,
      reward,
      completedAt: new Date("2026-08-13T00:01:00.000Z")
    });
    expect(afterGap.profile).toMatchObject({ currentStreak: 1, longestStreak: 10 });
  });

  it("keeps one streak day when different quests complete concurrently on the same UTC day", async () => {
    const repo = new PrismaQuestRepository();
    const { user, quest: firstQuest } = await createStartedQuest();
    const secondQuest = await createStartedQuestForUser(user.id, "Concurrent second quest");
    const reward = {
      xp: 10,
      coins: 1,
      multiplier: 1,
      dailyCoinLimitApplied: false
    };
    const completedAt = new Date("2026-08-12T12:00:00.000Z");

    const outcomes = await Promise.all([
      repo.completeWithReward({ questId: firstQuest.id, userId: user.id, reward, completedAt }),
      repo.completeWithReward({ questId: secondQuest.id, userId: user.id, reward, completedAt })
    ]);

    expect(outcomes).toHaveLength(2);
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile).toMatchObject({ currentStreak: 1, longestStreak: 1 });
  });

  it("calculates concurrent rewards from the serialized streak and remaining daily coins", async () => {
    const repo = new PrismaQuestRepository();
    const { user, quest: firstQuest } = await createStartedQuest();
    const secondQuest = await createStartedQuestForUser(user.id, "Concurrent capped reward quest");
    await prisma.userProfile.update({
      where: { userId: user.id },
      data: { currentStreak: 6, longestStreak: 6 }
    });
    await prisma.questCompletion.create({
      data: {
        questId: (
          await prisma.quest.create({
            data: {
              userId: user.id,
              title: "Prior-day streak evidence",
              difficulty: Difficulty.EASY,
              category: "testing",
              estimatedMinutes: 5,
              xpReward: 10,
              coinReward: 1,
              status: QuestStatus.COMPLETED
            }
          })
        ).id,
        userId: user.id,
        completedAt: new Date("2026-08-11T12:00:00.000Z"),
        xpEarned: 10,
        coinsEarned: 1
      }
    });
    await prisma.coinTransaction.create({
      data: {
        userId: user.id,
        type: CoinTransactionType.EARNED,
        amount: 498,
        reason: "Existing daily earnings",
        balanceAfter: 538,
        createdAt: new Date("2026-08-12T08:00:00.000Z")
      }
    });
    const seen: Array<{ currentStreak: number; coinsEarnedToday: number }> = [];
    const calculateReward = (input: { currentStreak: number; coinsEarnedToday: number }) => {
      seen.push(input);
      const coins = Math.min(2, Math.max(0, 500 - input.coinsEarnedToday));
      return {
        xp: input.currentStreak >= 7 ? 125 : 100,
        coins,
        multiplier: input.currentStreak >= 7 ? 1.25 : 1,
        dailyCoinLimitApplied: coins < 2
      };
    };
    const completedAt = new Date("2026-08-12T12:00:00.000Z");

    await Promise.all([
      repo.completeWithReward({ questId: firstQuest.id, userId: user.id, calculateReward, completedAt }),
      repo.completeWithReward({ questId: secondQuest.id, userId: user.id, calculateReward, completedAt })
    ]);

    expect(seen).toHaveLength(2);
    expect(seen.every((input) => input.currentStreak === 7)).toBe(true);
    expect(seen.map((input) => input.coinsEarnedToday).sort((a, b) => a - b)).toEqual([498, 500]);
    const payouts = await prisma.questCompletion.findMany({
      where: { questId: { in: [firstQuest.id, secondQuest.id] } }
    });
    expect(payouts.reduce((sum, payout) => sum + payout.coinsEarned, 0)).toBe(2);
    expect(payouts.every((payout) => payout.xpEarned === 125)).toBe(true);
  });

  it("rolls back the quest transition when a balance update fails", async () => {
    const repo = new PrismaQuestRepository();
    const { user, quest } = await createStartedQuest();

    await expect(
      repo.completeWithReward({
        questId: quest.id,
        userId: user.id,
        reward: {
          xp: 150,
          coins: 2_147_483_647,
          multiplier: 1.5,
          dailyCoinLimitApplied: false
        }
      })
    ).rejects.toBeDefined();

    const [storedQuest, profile, completionCount, xpTransactionCount, coinTransactionCount] = await Promise.all([
      prisma.quest.findUniqueOrThrow({ where: { id: quest.id } }),
      prisma.userProfile.findUniqueOrThrow({ where: { userId: user.id } }),
      prisma.questCompletion.count({ where: { questId: quest.id } }),
      prisma.xpTransaction.count({ where: { sourceType: "QUEST", sourceId: quest.id } }),
      prisma.coinTransaction.count({ where: { userId: user.id } })
    ]);

    expect(storedQuest.status).toBe(QuestStatus.IN_PROGRESS);
    expect(profile).toMatchObject({ totalXp: 900, coins: 40, level: 1 });
    expect({ completionCount, xpTransactionCount, coinTransactionCount }).toEqual({
      completionCount: 0,
      xpTransactionCount: 0,
      coinTransactionCount: 0
    });
  });

  it("keeps the reminder lead time when a recurring quest crosses a date boundary", async () => {
    const repo = new PrismaQuestRepository();
    const { quest } = await createStartedQuest({
      dueDate: new Date("2026-12-31T09:00:00.000Z"),
      reminderAt: new Date("2026-12-30T21:00:00.000Z"),
      recurrence: RecurrenceType.DAILY
    });

    const successor = await repo.createRecurringSuccessor(quest, new Date("2027-01-01T09:00:00.000Z"));

    expect(successor?.reminderAt?.toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });
});

async function createStartedQuest(
  questData: Partial<{
    dueDate: Date;
    reminderAt: Date;
    recurrence: RecurrenceType;
  }> = {}
) {
  const user = await prisma.user.create({
    data: {
      name: "Transaction Tester",
      email: "quest-transaction@example.com",
      passwordHash: "hashed-password",
      profile: {
        create: {
          totalXp: 900,
          coins: 40,
          level: 1
        }
      }
    }
  });
  const quest = await prisma.quest.create({
    data: {
      userId: user.id,
      title: "Complete transaction quest",
      difficulty: Difficulty.HARD,
      category: "testing",
      estimatedMinutes: 45,
      xpReward: 100,
      coinReward: 10,
      status: QuestStatus.IN_PROGRESS,
      ...questData
    }
  });

  return { user, quest };
}

function createStartedQuestForUser(userId: string, title: string) {
  return prisma.quest.create({
    data: {
      userId,
      title,
      difficulty: Difficulty.MEDIUM,
      category: "testing",
      estimatedMinutes: 25,
      xpReward: 50,
      coinReward: 5,
      status: QuestStatus.IN_PROGRESS
    }
  });
}
