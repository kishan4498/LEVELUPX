import { Difficulty, QuestPriority, QuestStatus, RecurrenceType, type Quest } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../common/errors/AppError.js";
import type { AbuseService } from "../abuse/abuse.service.js";
import type { AchievementService } from "../achievements/achievement.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { RewardService } from "../rewards/reward.service.js";
import type { IQuestRepository } from "./quest.repository.js";
import { QuestService } from "./quest.service.js";

function quest(): Quest {
  return {
    id: "quest-1",
    userId: "user-1",
    clientRequestId: "123e4567-e89b-12d3-a456-426614174000",
    title: "Replay-safe quest",
    description: null,
    projectId: null,
    parentQuestId: null,
    recurrenceSourceId: null,
    difficulty: Difficulty.EASY,
    priority: QuestPriority.HIGH,
    category: "Quick capture",
    tags: [],
    recurrence: RecurrenceType.NONE,
    estimatedMinutes: 25,
    xpReward: 50,
    coinReward: 3,
    status: QuestStatus.PENDING,
    dueDate: null,
    reminderAt: null,
    reminderSentAt: null,
    createdAt: new Date("2026-08-04T00:00:00.000Z"),
    updatedAt: new Date("2026-08-04T00:00:00.000Z")
  };
}

describe("QuestService idempotency", () => {
  it("returns the stored quest when an offline action is replayed", async () => {
    const stored = quest();
    const repo = {
      findByClientRequestId: vi.fn().mockResolvedValue(stored),
      create: vi.fn()
    } as unknown as IQuestRepository;
    const service = new QuestService(
      repo,
      {} as RewardService,
      {} as AchievementService,
      {} as NotificationService,
      {} as AbuseService
    );

    const drafted = await service.draftQuest("user-1", {
      clientRequestId: stored.clientRequestId!,
      title: stored.title,
      difficulty: Difficulty.EASY,
      category: stored.category,
      estimatedMinutes: 25
    });

    expect(drafted.id).toBe(stored.id);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("resolves a concurrent unique-key race to the winning quest", async () => {
    const stored = quest();
    const repo = {
      findByClientRequestId: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(stored),
      create: vi.fn().mockRejectedValue(
        new AppError("Quest request identifier is already in use", 409, "QUEST_REQUEST_ID_CONFLICT")
      ),
      findById: vi.fn()
    } as unknown as IQuestRepository;
    const service = new QuestService(
      repo,
      {} as RewardService,
      {} as AchievementService,
      {} as NotificationService,
      {} as AbuseService
    );

    const drafted = await service.draftQuest("user-1", {
      clientRequestId: stored.clientRequestId!,
      title: stored.title,
      difficulty: Difficulty.EASY,
      category: stored.category,
      estimatedMinutes: 25
    });

    expect(drafted.id).toBe(stored.id);
    expect(repo.findByClientRequestId).toHaveBeenCalledTimes(2);
  });

  it("does not hide an unrelated create failure during an offline replay", async () => {
    const failure = new Error("database unavailable");
    const repo = {
      findByClientRequestId: vi.fn().mockResolvedValueOnce(null),
      create: vi.fn().mockRejectedValue(failure),
      findById: vi.fn()
    } as unknown as IQuestRepository;
    const service = new QuestService(
      repo,
      {} as RewardService,
      {} as AchievementService,
      {} as NotificationService,
      {} as AbuseService
    );

    await expect(
      service.draftQuest("user-1", {
        clientRequestId: "123e4567-e89b-12d3-a456-426614174001",
        title: "Keep infrastructure failures visible",
        difficulty: Difficulty.EASY,
        category: "Quick capture",
        estimatedMinutes: 25
      })
    ).rejects.toBe(failure);

    expect(repo.findByClientRequestId).toHaveBeenCalledOnce();
  });
});
