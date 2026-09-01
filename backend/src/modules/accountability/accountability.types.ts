import type { ConnectionStatus } from "@prisma/client";

export type AccountabilityDirection = "INCOMING" | "OUTGOING";

export type AccountabilityProgressDto = {
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

export type AccountabilityConnectionDto = {
  id: string;
  status: ConnectionStatus;
  direction: AccountabilityDirection;
  person: {
    id: string;
    name: string;
  };
  progress?: AccountabilityProgressDto;
  createdAt: string;
  updatedAt: string;
};

export type CreateAccountabilityRequestInput = {
  email: string;
};

export type RespondToAccountabilityRequestInput = {
  status: "ACCEPTED" | "DECLINED";
};
