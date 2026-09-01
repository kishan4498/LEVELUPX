import { Difficulty, QuestPriority, QuestStatus, RecurrenceType, type Quest, type UserProfile } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AbuseService } from "../abuse/abuse.service.js";
import type { AchievementService } from "../achievements/achievement.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { RewardService } from "../rewards/reward.service.js";
import { projectQuestCompletionStreak, type IQuestRepository } from "./quest.repository.js";
import { QuestService } from "./quest.service.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("projectQuestCompletionStreak", () => {
  it("starts the first successful completion at one day", () => {
    expect(
      projectQuestCompletionStreak(0, null, new Date("2026-08-12T10:00:00.000Z"))
    ).toBe(1);
  });

  it("does not increment for another completion on the same UTC calendar day", () => {
    expect(
      projectQuestCompletionStreak(
        7,
        new Date("2026-08-12T00:05:00.000Z"),
        new Date("2026-08-12T23:55:00.000Z")
      )
    ).toBe(7);
  });

  it("increments when the latest completion was on the previous UTC day", () => {
    expect(
      projectQuestCompletionStreak(
        7,
        new Date("2026-08-11T23:55:00.000Z"),
        new Date("2026-08-12T00:05:00.000Z")
      )
    ).toBe(8);
  });

  it("resets after a UTC calendar-day gap", () => {
    expect(
      projectQuestCompletionStreak(
        30,
        new Date("2026-08-10T23:59:00.000Z"),
        new Date("2026-08-12T00:01:00.000Z")
      )
    ).toBe(1);
  });
});

describe("QuestService streak-aware rewards", () => {
  it("calculates the bounty with the streak established by this completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:30:00.000Z"));
    const startedQuest = makeStartedQuest();
    const profile = makeProfile();
    const reward = {
      xp: 100,
      coins: 10,
      multiplier: 1.5,
      dailyCoinLimitApplied: false
    };
    const repo = {
      findById: vi.fn().mockResolvedValue(startedQuest),
      countOpenSubtasks: vi.fn().mockResolvedValue(0),
      findProfileByUserId: vi.fn().mockResolvedValue(profile),
      findLatestCompletionAt: vi.fn().mockResolvedValue(new Date("2026-08-11T23:59:00.000Z")),
      completeWithReward: vi.fn().mockImplementation(async (input) => ({
        quest: { ...startedQuest, status: QuestStatus.COMPLETED },
        profile: { ...profile, currentStreak: 8, longestStreak: 8 },
        reward: input.calculateReward({
          quest: startedQuest,
          currentStreak: 8,
          coinsEarnedToday: 0
        })
      }))
    } as unknown as IQuestRepository;
    const rewardService = {
      getEconomySettings: vi.fn().mockResolvedValue({}),
      calculate: vi.fn().mockReturnValue(reward)
    } as unknown as RewardService;
    const service = new QuestService(
      repo,
      rewardService,
      {
        processQuestCompletionUnlocks: vi.fn().mockResolvedValue({ achievements: [], profile: null })
      } as unknown as AchievementService,
      {
        dispatchNotification: vi.fn().mockResolvedValue(undefined)
      } as unknown as NotificationService,
      {
        auditQuestCompletion: vi.fn().mockResolvedValue([])
      } as unknown as AbuseService
    );

    await service.turnInQuest("user-1", startedQuest.id);

    expect(rewardService.calculate).toHaveBeenCalledWith(
      { quest: startedQuest, currentStreak: 8 },
      {},
      0
    );
    expect(repo.completeWithReward).toHaveBeenCalledWith(
      expect.objectContaining({
        questId: startedQuest.id,
        userId: "user-1",
        calculateReward: expect.any(Function),
        completedAt: new Date("2026-08-12T09:30:00.000Z")
      })
    );
  });
});

function makeStartedQuest(): Quest {
  return {
    id: "quest-1",
    userId: "user-1",
    title: "Continue the streak",
    description: null,
    difficulty: Difficulty.MEDIUM,
    category: "study",
    estimatedMinutes: 25,
    xpReward: 50,
    coinReward: 5,
    status: QuestStatus.IN_PROGRESS,
    dueDate: null,
    projectId: null,
    parentQuestId: null,
    recurrenceSourceId: null,
    priority: QuestPriority.MEDIUM,
    tags: [],
    recurrence: RecurrenceType.NONE,
    reminderAt: null,
    reminderSentAt: null,
    clientRequestId: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z")
  };
}

function makeProfile(): UserProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    avatarUrl: null,
    level: 3,
    totalXp: 2_000,
    coins: 100,
    currentStreak: 7,
    longestStreak: 7,
    selectedCharacterClassId: null,
    selectedCosmeticId: null,
    timezone: "UTC",
    productivityMode: "PERSONAL",
    preferredFocusMinutes: 25,
    dailyGoalMinutes: 60,
    onboardingCompletedAt: null
  };
}
