import { Difficulty, QuestStatus, RecurrenceType, type Quest } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { publishRealtimeEvent } from "../../realtime/realtime.publisher.js";
import { realtimeEvents } from "../../realtime/realtime.types.js";
import type { AbuseService } from "../abuse/abuse.service.js";
import type { AchievementService } from "../achievements/achievement.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { RewardService } from "../rewards/reward.service.js";
import type {
  CreateQuestInput,
  QuestDoneDto,
  QuestListInput,
  QuestDto,
  UpdateQuestInput
} from "./quest.types.js";
import type { IQuestRepository } from "./quest.repository.js";

type BaseReward = {
  xpReward: number;
  coinReward: number;
};

export class QuestService {
  constructor(
    private readonly repo: IQuestRepository,
    private readonly rewardService: RewardService,
    private readonly achievementService: AchievementService,
    private readonly notificationService: NotificationService,
    private readonly abuseService: AbuseService
  ) {}

  async draftQuest(userId: string, questDraft: CreateQuestInput): Promise<QuestDto> {
    if (questDraft.clientRequestId && this.repo.findByClientRequestId) {
      const existing = await this.repo.findByClientRequestId(questDraft.clientRequestId);

      if (existing) {
        if (existing.userId !== userId) {
          throw new AppError("Quest request identifier is already in use", 409, "QUEST_REQUEST_ID_CONFLICT");
        }

        return this.toDto(existing);
      }
    }

    await this.validateQuestLinks(userId, questDraft.projectId, questDraft.parentQuestId);
    const reward = this.getBaseReward(questDraft.difficulty, questDraft.estimatedMinutes);

    try {
      const quest = await this.repo.create({
        clientRequestId: questDraft.clientRequestId,
        userId,
        title: questDraft.title,
        description: questDraft.description,
        difficulty: questDraft.difficulty,
        category: questDraft.category,
        estimatedMinutes: questDraft.estimatedMinutes,
        xpReward: reward.xpReward,
        coinReward: reward.coinReward,
        dueDate: questDraft.dueDate ? new Date(questDraft.dueDate) : undefined,
        projectId: questDraft.projectId ?? undefined,
        parentQuestId: questDraft.parentQuestId ?? undefined,
        priority: questDraft.priority,
        tags: normalizeTags(questDraft.tags),
        recurrence: questDraft.recurrence,
        reminderAt: questDraft.reminderAt ? new Date(questDraft.reminderAt) : undefined
      });

      return this.toDto(quest);
    } catch (error) {
      // Concurrent offline replays return the row created by the winning request.
      const existing = await this.findReplayWinner(error, questDraft.clientRequestId);

      if (existing?.userId === userId) {
        return this.toDto(existing);
      }

      throw error;
    }
  }

  async browseQuests(userId: string, query: QuestListInput): Promise<QuestDto[]> {
    const quests = await this.repo.findManyForUser({
      userId,
      status: query.status,
      difficulty: query.difficulty,
      projectId: query.projectId,
      priority: query.priority,
      q: query.q,
      tag: query.tag,
      skip: (query.page - 1) * query.limit,
      take: query.limit
    });

    return quests.map((quest) => this.toDto(quest));
  }

  async getById(userId: string, questId: string): Promise<QuestDto> {
    const quest = await this.getOwnedQuest(userId, questId);
    return this.toDto(quest);
  }

  async tweakQuest(userId: string, questId: string, patch: UpdateQuestInput): Promise<QuestDto> {
    const quest = await this.getOwnedQuest(userId, questId);

    if (quest.status === QuestStatus.COMPLETED || quest.status === QuestStatus.ARCHIVED) {
      throw new AppError("Completed or archived quests cannot be edited", 409, "QUEST_NOT_EDITABLE");
    }

    const difficulty = patch.difficulty ?? quest.difficulty;
    const minutes = patch.estimatedMinutes ?? quest.estimatedMinutes;
    const reward = this.getBaseReward(difficulty, minutes);
    await this.validateQuestLinks(userId, patch.projectId, patch.parentQuestId, quest.id);

    const updated = await this.repo.update(quest.id, {
      ...(patch.title ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.difficulty ? { difficulty: patch.difficulty } : {}),
      ...(patch.category ? { category: patch.category } : {}),
      ...(patch.estimatedMinutes ? { estimatedMinutes: patch.estimatedMinutes } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.parentQuestId !== undefined ? { parentQuestId: patch.parentQuestId } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.tags ? { tags: normalizeTags(patch.tags) } : {}),
      ...(patch.recurrence ? { recurrence: patch.recurrence } : {}),
      ...(patch.reminderAt !== undefined
        ? {
            reminderAt: patch.reminderAt ? new Date(patch.reminderAt) : null,
            reminderSentAt: null
          }
        : {}),
      xpReward: reward.xpReward,
      coinReward: reward.coinReward
    });

    return this.toDto(updated);
  }

  async retireQuest(userId: string, questId: string): Promise<void> {
    const quest = await this.getOwnedQuest(userId, questId);

    if (quest.status === QuestStatus.ARCHIVED) {
      return;
    }

    await this.repo.archive(quest.id);
  }

  async embarkOnQuest(userId: string, questId: string): Promise<QuestDto> {
    const quest = await this.getOwnedQuest(userId, questId);

    if (quest.status !== QuestStatus.PENDING) {
      throw new AppError("Only pending quests can be started", 409, "QUEST_NOT_STARTABLE");
    }

    const updated = await this.repo.updateStatus(quest.id, QuestStatus.IN_PROGRESS);
    return this.toDto(updated);
  }

  async abandonQuest(userId: string, questId: string): Promise<QuestDto> {
    const quest = await this.getOwnedQuest(userId, questId);

    if (quest.status !== QuestStatus.PENDING && quest.status !== QuestStatus.IN_PROGRESS) {
      throw new AppError("Only pending or in-progress quests can be failed", 409, "QUEST_NOT_FAILABLE");
    }

    const updated = await this.repo.updateStatus(quest.id, QuestStatus.FAILED);
    return this.toDto(updated);
  }

  async turnInQuest(userId: string, questId: string): Promise<QuestDoneDto> {
    const quest = await this.getOwnedQuest(userId, questId);

    if (quest.status !== QuestStatus.IN_PROGRESS) {
      throw new AppError("Only in-progress quests can be completed", 409, "QUEST_NOT_COMPLETABLE");
    }

    const openSubtasks = (await this.repo.countOpenSubtasks?.(quest.id)) ?? 0;

    if (openSubtasks > 0) {
      throw new AppError("Complete or archive the open subtasks first", 409, "QUEST_HAS_OPEN_SUBTASKS");
    }

    const completedAt = new Date();
    const settings = await this.rewardService.getEconomySettings();

    const completion = await this.repo.completeWithReward({
      questId: quest.id,
      userId,
      calculateReward: ({ quest: lockedQuest, currentStreak, coinsEarnedToday }) =>
        this.rewardService.calculate(
          { quest: lockedQuest, currentStreak },
          settings,
          coinsEarnedToday
        ),
      completedAt
    });
    const reward = completion.reward;
    const successor = await this.createRecurringSuccessor(completion.quest);
    // Downstream checks run after commit so they see the awarded balances. If an
    // audit dependency fails, the request rejects but this completion/reward stays committed.
    const unlocks = await this.achievementService.processQuestCompletionUnlocks(userId);
    const achievements = unlocks.achievements;
    const abuseReports = await this.abuseService.auditQuestCompletion({
      userId,
      questId: completion.quest.id,
      questTitle: completion.quest.title
    });

    await this.notificationService.dispatchNotification({
      userId,
      title: "Quest completed",
      message: `You earned ${reward.xp} XP and ${reward.coins} coins from "${completion.quest.title}".`,
      category: "REWARD"
    });

    await Promise.all(
      achievements.map((achievement) =>
        this.notificationService.dispatchNotification({
          userId,
          title: "Achievement unlocked",
          message: `${achievement.title}: ${achievement.description} (+${achievement.xpBonus} XP, +${achievement.coinBonus} coins)`,
          category: "ACHIEVEMENT"
        })
      )
    );

    for (const achievement of achievements) {
      publishRealtimeEvent({
        name: realtimeEvents.achievementUnlocked,
        userId,
        payload: {
          achievementId: achievement.id,
          title: achievement.title,
          xpBonus: achievement.xpBonus,
          coinBonus: achievement.coinBonus
        }
      });
    }

    return {
      quest: this.toDto(completion.quest),
      reward,
      unlockedAchievements: achievements.map((achievement) => ({
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        rarity: achievement.rarity,
        xpBonus: achievement.xpBonus,
        coinBonus: achievement.coinBonus,
        unlockedAt: achievement.unlockedAt
      })),
      abuseReports: abuseReports.map((report) => ({
        id: report.id,
        reason: report.reason,
        severity: report.severity
      })),
      profile: {
        level: unlocks.profile?.level ?? completion.profile.level,
        totalXp: unlocks.profile?.totalXp ?? completion.profile.totalXp,
        coins: unlocks.profile?.coins ?? completion.profile.coins,
        currentStreak: completion.profile.currentStreak,
        longestStreak: completion.profile.longestStreak
      },
      recurringSuccessor: successor ? this.toDto(successor) : null
    };
  }

  private async getOwnedQuest(userId: string, questId: string): Promise<Quest> {
    const quest = await this.repo.findById(questId);

    if (!quest || quest.userId !== userId) {
      throw new AppError("Quest not found", 404, "QUEST_NOT_FOUND");
    }

    return quest;
  }

  private async findReplayWinner(error: unknown, clientRequestId: string | undefined) {
    if (
      !(error instanceof AppError) ||
      error.code !== "QUEST_REQUEST_ID_CONFLICT" ||
      !clientRequestId ||
      !this.repo.findByClientRequestId
    ) {
      return null;
    }

    return this.repo.findByClientRequestId(clientRequestId);
  }

  private getBaseReward(difficulty: Difficulty, minutes: number): BaseReward {
    const baseXp = Math.max(10, Math.round(minutes * 2));
    const baseCoins = Math.max(2, Math.round(minutes / 10));

    const multiplier = {
      EASY: 1,
      MEDIUM: 1.25,
      HARD: 1.75,
      BOSS: 2.5,
      RECOVERY: 0.75
    }[difficulty];

    return {
      xpReward: Math.round(baseXp * multiplier),
      coinReward: Math.round(baseCoins * multiplier)
    };
  }

  private toDto(quest: Quest): QuestDto {
    return {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      difficulty: quest.difficulty,
      category: quest.category,
      estimatedMinutes: quest.estimatedMinutes,
      xpReward: quest.xpReward,
      coinReward: quest.coinReward,
      status: quest.status,
      dueDate: quest.dueDate?.toISOString() ?? null,
      projectId: quest.projectId,
      parentQuestId: quest.parentQuestId,
      priority: quest.priority,
      tags: quest.tags,
      recurrence: quest.recurrence,
      reminderAt: quest.reminderAt?.toISOString() ?? null,
      createdAt: quest.createdAt.toISOString(),
      updatedAt: quest.updatedAt.toISOString()
    };
  }

  private async validateQuestLinks(
    userId: string,
    projectId: string | null | undefined,
    parentQuestId: string | null | undefined,
    questId?: string
  ) {
    if (projectId && this.repo.findProjectById) {
      const project = await this.repo.findProjectById(projectId);

      if (!project || project.userId !== userId || project.archivedAt) {
        throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
      }
    }

    if (parentQuestId) {
      if (parentQuestId === questId) {
        throw new AppError("A quest cannot be its own subtask", 400, "INVALID_PARENT_QUEST");
      }

      const parent = await this.getOwnedQuest(userId, parentQuestId);

      if (parent.parentQuestId) {
        throw new AppError("Subtasks can only be one level deep", 400, "SUBTASK_DEPTH_EXCEEDED");
      }

      if (parent.status === QuestStatus.COMPLETED || parent.status === QuestStatus.ARCHIVED) {
        throw new AppError("Completed or archived quests cannot receive subtasks", 409, "PARENT_QUEST_CLOSED");
      }
    }
  }

  private async createRecurringSuccessor(quest: Quest) {
    if (quest.recurrence === RecurrenceType.NONE || !this.repo.createRecurringSuccessor) {
      return null;
    }

    const nextDueDate = nextRecurrenceDate(quest.dueDate ?? new Date(), quest.recurrence);
    return this.repo.createRecurringSuccessor(quest, nextDueDate);
  }
}

function normalizeTags(tags: string[] | undefined) {
  return tags ? [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))] : undefined;
}

function nextRecurrenceDate(date: Date, recurrence: RecurrenceType) {
  const next = new Date(date);

  if (recurrence === RecurrenceType.DAILY || recurrence === RecurrenceType.WEEKDAYS) {
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (recurrence === RecurrenceType.WEEKDAYS && (next.getUTCDay() === 0 || next.getUTCDay() === 6));
  } else if (recurrence === RecurrenceType.WEEKLY) {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (recurrence === RecurrenceType.MONTHLY) {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }

  return next;
}
