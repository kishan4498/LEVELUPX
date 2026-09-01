export type FocusSessionType = "POMODORO" | "DEEP_WORK" | "SHORT_BREAK" | "LONG_BREAK";

export type FocusSession = {
  id: string;
  questId: string | null;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  sessionType: FocusSessionType;
  completed: boolean;
  targetMinutes: number | null;
  goal: string | null;
  pausedAt: string | null;
  pausedSeconds: number;
  distractionNote: string | null;
};

export type FocusSessionStats = {
  totalSessions: number;
  completedSessions: number;
  totalFocusMinutes: number;
  averageSessionMinutes: number;
};
