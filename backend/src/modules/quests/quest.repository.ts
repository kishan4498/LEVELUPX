import { CoinTransactionType, Prisma, QuestStatus, type Project, type Quest, type UserProfile } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { prisma } from "../../prisma/client.js";
import type { RewardResult } from "../rewards/reward.types.js";

export type CreateQuestData = {
  clientRequestId?: string;
  userId: string;
  title: string;
  description?: string;
  difficulty: Quest["difficulty"];
  category: string;
  estimatedMinutes: number;
  xpReward: number;
  coinReward: number;
  dueDate?: Date;
  projectId?: string;
  parentQuestId?: string;
  priority?: Quest["priority"];
  tags?: string[];
  recurrence?: Quest["recurrence"];
  reminderAt?: Date;
  recurrenceSourceId?: string;
};

export type UpdateQuestData = Partial<
  Omit<CreateQuestData, "userId" | "xpReward" | "coinReward" | "dueDate" | "reminderAt" | "projectId" | "parentQuestId">
> & {
  xpReward?: number;
  coinReward?: number;
  status?: QuestStatus;
  dueDate?: Date | null;
  reminderAt?: Date | null;
  reminderSentAt?: Date | null;
  projectId?: string | null;
  parentQuestId?: string | null;
};

export type QuestListFilters = {
  userId: string;
  status?: QuestStatus;
  difficulty?: Quest["difficulty"];
  projectId?: string;
  priority?: Quest["priority"];
  q?: string;
  tag?: string;
  skip: number;
  take: number;
};

export type CompleteQuestResult = {
  quest: Quest;
  profile: UserProfile;
  reward: RewardResult;
};

export type CompletionRewardCalculator = (input: {
  quest: Quest;
  currentStreak: number;
  coinsEarnedToday: number;
}) => RewardResult;

export interface IQuestRepository {
  create(questDraft: CreateQuestData): Promise<Quest>;
  findByClientRequestId?(clientRequestId: string): Promise<Quest | null>;
  findById(id: string): Promise<Quest | null>;
  findProfileByUserId(userId: string): Promise<UserProfile | null>;
  findLatestCompletionAt?(userId: string): Promise<Date | null>;
  findProjectById?(id: string): Promise<Project | null>;
  findManyForUser(filters: QuestListFilters): Promise<Quest[]>;
  countOpenSubtasks?(questId: string): Promise<number>;
  update(id: string, patch: UpdateQuestData): Promise<Quest>;
  updateStatus(id: string, status: QuestStatus): Promise<Quest>;
  archive(id: string): Promise<Quest>;
  completeWithReward(completion: {
    questId: string;
    userId: string;
    reward?: RewardResult;
    calculateReward?: CompletionRewardCalculator;
    completedAt?: Date;
  }): Promise<CompleteQuestResult>;
  createRecurringSuccessor?(source: Quest, dueDate: Date): Promise<Quest | null>;
}

export class PrismaQuestRepository implements IQuestRepository {
  async create(questDraft: CreateQuestData) {
    try {
      return await prisma.quest.create({
        data: questDraft
      });
    } catch (error) {
      if (questDraft.clientRequestId && isUniqueViolation(error, "clientRequestId")) {
        throw new AppError("Quest request identifier is already in use", 409, "QUEST_REQUEST_ID_CONFLICT");
      }

      throw error;
    }
  }

  findByClientRequestId(clientRequestId: string) {
    return prisma.quest.findUnique({
      where: { clientRequestId }
    });
  }

  findById(id: string) {
    return prisma.quest.findUnique({
      where: { id }
    });
  }

  findProfileByUserId(userId: string) {
    return prisma.userProfile.findUnique({
      where: { userId }
    });
  }

  async findLatestCompletionAt(userId: string) {
    const completion = await prisma.questCompletion.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true }
    });

    return completion?.completedAt ?? null;
  }

  findProjectById(id: string) {
    return prisma.project.findUnique({ where: { id } });
  }

  findManyForUser(filters: QuestListFilters) {
    const where = {
      userId: filters.userId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.tag ? { tags: { has: filters.tag } } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" as const } },
              { description: { contains: filters.q, mode: "insensitive" as const } },
              { category: { contains: filters.q, mode: "insensitive" as const } }
            ]
          }
        : {})
    } satisfies Prisma.QuestWhereInput;

    return prisma.quest.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: filters.skip,
      take: filters.take
    });
  }

  update(id: string, patch: UpdateQuestData) {
    return prisma.quest.update({
      where: { id },
      data: patch
    });
  }

  countOpenSubtasks(questId: string) {
    return prisma.quest.count({
      where: {
        parentQuestId: questId,
        status: { in: [QuestStatus.PENDING, QuestStatus.IN_PROGRESS] }
      }
    });
  }

  updateStatus(id: string, status: QuestStatus) {
    return prisma.quest.update({
      where: { id },
      data: { status }
    });
  }

  archive(id: string) {
    return prisma.quest.update({
      where: { id },
      data: { status: "ARCHIVED" }
    });
  }

  completeWithReward(completion: {
    questId: string;
    userId: string;
    reward?: RewardResult;
    calculateReward?: CompletionRewardCalculator;
    completedAt?: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const completedAt = completion.completedAt ?? new Date();
      // The guarded status change is the payout idempotency boundary.
      const completed = await tx.quest.updateMany({
        where: {
          id: completion.questId,
          userId: completion.userId,
          status: QuestStatus.IN_PROGRESS
        },
        data: {
          status: QuestStatus.COMPLETED
        }
      });

      if (completed.count === 0) {
        throw new AppError("Only in-progress quests can be completed", 409, "QUEST_NOT_COMPLETABLE");
      }

      const quest = await tx.quest.findUnique({
        where: { id: completion.questId }
      });

      if (!quest) {
        throw new AppError("Quest not found", 404, "QUEST_NOT_FOUND");
      }

      // Serialize every same-user payout before reading the streak and daily
      // allowance that determine this completion's reward.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "UserProfile" WHERE "userId" = ${completion.userId} FOR UPDATE`
      );
      const lockedProfile = await tx.userProfile.findUnique({
        where: { userId: completion.userId }
      });
      if (!lockedProfile) {
        throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
      }

      const latestCompletion = await tx.questCompletion.findFirst({
        where: { userId: completion.userId },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true }
      });
      const nextStreak = projectQuestCompletionStreak(
        lockedProfile.currentStreak,
        latestCompletion?.completedAt ?? null,
        completedAt
      );
      const nextLongestStreak = Math.max(lockedProfile.longestStreak, nextStreak);
      const reward = completion.calculateReward
        ? completion.calculateReward({
            quest,
            currentStreak: nextStreak,
            coinsEarnedToday: await this.getCoinsEarnedTodayForUpdate(tx, completion.userId, completedAt)
          })
        : completion.reward;

      if (!reward) {
        throw new Error("A quest-completion reward calculator or result is required");
      }
      const nextTotalXp = lockedProfile.totalXp + reward.xp;
      const profile = await tx.userProfile.update({
        where: { userId: completion.userId },
        data: {
          totalXp: nextTotalXp,
          coins: lockedProfile.coins + reward.coins,
          level: Math.floor(nextTotalXp / 1000) + 1,
          currentStreak: nextStreak,
          longestStreak: nextLongestStreak
        }
      });

      await tx.questCompletion.create({
        data: {
          questId: completion.questId,
          userId: completion.userId,
          completedAt,
          xpEarned: reward.xp,
          coinsEarned: reward.coins
        }
      });

      await tx.xpTransaction.create({
        data: {
          userId: completion.userId,
          sourceType: "QUEST",
          sourceId: completion.questId,
          amount: reward.xp,
          multiplier: reward.multiplier,
          reason: `Completed quest: ${quest.title}`
        }
      });

      await tx.coinTransaction.create({
        data: {
          userId: completion.userId,
          type: CoinTransactionType.EARNED,
          amount: reward.coins,
          reason: `Completed quest: ${quest.title}`,
          balanceAfter: profile.coins
        }
      });

      return {
        quest,
        profile,
        reward
      };
    });
  }

  private async getCoinsEarnedTodayForUpdate(
    tx: Prisma.TransactionClient,
    userId: string,
    completedAt: Date
  ) {
    const dayStart = new Date(completedAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const totals = await tx.coinTransaction.aggregate({
      where: {
        userId,
        type: { in: [CoinTransactionType.EARNED, CoinTransactionType.BONUS, CoinTransactionType.ADMIN_ADJUSTMENT] },
        createdAt: { gte: dayStart }
      },
      _sum: { amount: true }
    });
    return totals._sum.amount ?? 0;
  }

  async createRecurringSuccessor(source: Quest, dueDate: Date) {
    try {
      return await prisma.quest.create({
        data: {
          userId: source.userId,
          title: source.title,
          description: source.description,
          difficulty: source.difficulty,
          category: source.category,
          estimatedMinutes: source.estimatedMinutes,
          xpReward: source.xpReward,
          coinReward: source.coinReward,
          dueDate,
          projectId: source.projectId,
          parentQuestId: source.parentQuestId,
          priority: source.priority,
          tags: source.tags,
          recurrence: source.recurrence,
          reminderAt: source.reminderAt ? shiftReminder(source.reminderAt, source.dueDate, dueDate) : null,
          recurrenceSourceId: source.id
        }
      });
    } catch (error) {
      if (isUniqueViolation(error, "recurrenceSourceId")) {
        return null;
      }

      throw error;
    }
  }
}

export function projectQuestCompletionStreak(
  currentStreak: number,
  latestCompletionAt: Date | null,
  completedAt: Date
) {
  if (!latestCompletionAt) {
    return 1;
  }

  const latestDay = utcDayNumber(latestCompletionAt);
  const completionDay = utcDayNumber(completedAt);
  const elapsedDays = completionDay - latestDay;

  if (elapsedDays <= 0) {
    return Math.max(1, currentStreak);
  }

  if (elapsedDays === 1) {
    return Math.max(1, currentStreak) + 1;
  }

  return 1;
}

function utcDayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

function shiftReminder(reminder: Date, dueDate: Date | null, nextDue: Date) {
  if (!dueDate) {
    return nextDue;
  }

  return new Date(nextDue.getTime() - (dueDate.getTime() - reminder.getTime()));
}

function isUniqueViolation(error: unknown, field: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes(field) : target === field;
}
