import type { SessionType } from "@prisma/client";

export type StartSessionInput = {
  questId?: string;
  sessionType: SessionType;
  targetMinutes?: number;
  goal?: string;
};

export type StopSessionInput = {
  completed?: boolean;
  distractionNote?: string;
};

export type NoteInput = {
  distractionNote: string;
};

export type HistoryInput = {
  page: number;
  limit: number;
  from?: string;
  to?: string;
};

export type SessionDto = {
  id: string;
  questId: string | null;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  sessionType: SessionType;
  completed: boolean;
  targetMinutes: number | null;
  goal: string | null;
  pausedAt: string | null;
  pausedSeconds: number;
  distractionNote: string | null;
};

export type SessionStats = {
  totalSessions: number;
  completedSessions: number;
  totalFocusMinutes: number;
  averageSessionMinutes: number;
};
