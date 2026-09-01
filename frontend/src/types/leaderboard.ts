export type LeaderboardPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME";

export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  xp: number;
  focusMinutes: number;
  period: LeaderboardPeriod;
};
