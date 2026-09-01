export type AccountabilityStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";

export type AccountabilityConnection = {
  id: string;
  status: AccountabilityStatus;
  direction: "INCOMING" | "OUTGOING";
  person: {
    id: string;
    name: string;
  };
  progress?: {
    completedQuestsLast7Days: number;
    focusMinutesLast7Days: number;
    currentStreak: number;
    focusPresence: {
      sessionId: string;
      state: "FOCUSING" | "PAUSED";
      sessionType: string;
      targetMinutes: number | null;
      startedAt: string;
      updatedAt: string;
    } | null;
  };
  createdAt: string;
  updatedAt: string;
};
