export type QuestDifficulty = "EASY" | "MEDIUM" | "HARD" | "BOSS" | "RECOVERY";
export type QuestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "ARCHIVED";
export type QuestPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type QuestRecurrence = "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archivedAt: string | null;
  activeQuestCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Quest = {
  id: string;
  title: string;
  description: string | null;
  difficulty: QuestDifficulty;
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
  recurrence: QuestRecurrence;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuestCompletionResponse = {
  quest: Quest;
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
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }[];
  profile: {
    level: number;
    totalXp: number;
    coins: number;
    currentStreak: number;
    longestStreak: number;
  };
  recurringSuccessor?: Quest | null;
};
