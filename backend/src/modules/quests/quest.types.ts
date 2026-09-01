import type { Difficulty, QuestPriority, QuestStatus, RecurrenceType } from "@prisma/client";

export type QuestDto = {
  id: string;
  title: string;
  description: string | null;
  difficulty: Difficulty;
  category: string;
  estimatedMinutes: number;
  xpReward: number;
  coinReward: number;
  status: QuestStatus;
  dueDate: string | null;
  projectId: string | null;
  parentQuestId: string | null;
  priority: QuestPriority;
  tags: string[];
  recurrence: RecurrenceType;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateQuestInput = {
  clientRequestId?: string;
  title: string;
  description?: string;
  difficulty: Difficulty;
  category: string;
  estimatedMinutes: number;
  dueDate?: string | null;
  projectId?: string | null;
  parentQuestId?: string | null;
  priority?: QuestPriority;
  tags?: string[];
  recurrence?: RecurrenceType;
  reminderAt?: string | null;
};

export type UpdateQuestInput = Partial<CreateQuestInput>;

export type QuestListInput = {
  status?: QuestStatus;
  difficulty?: Difficulty;
  projectId?: string;
  priority?: QuestPriority;
  q?: string;
  tag?: string;
  page: number;
  limit: number;
};

export type QuestDoneDto = {
  quest: QuestDto;
  reward: {
    xp: number;
    coins: number;
    multiplier: number;
    dailyCoinLimitApplied: boolean;
  };
  unlockedAchievements: {
    id: string;
    title: string;
    description: string;
    rarity: string;
    xpBonus: number;
    coinBonus: number;
    unlockedAt: string;
  }[];
  abuseReports: {
    id: string;
    reason: string;
    severity: string;
  }[];
  profile: {
    level: number;
    totalXp: number;
    coins: number;
    currentStreak: number;
    longestStreak: number;
  };
  recurringSuccessor?: QuestDto | null;
};
