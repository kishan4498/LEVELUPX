import type { LeaderboardPeriod } from "@prisma/client";

export type LeaderboardQueryInput = {
  period: LeaderboardPeriod;
  limit: number;
};

export type LeaderboardRowDto = {
  rank: number;
  userId: string;
  name: string;
  xp: number;
  focusMinutes: number;
  period: LeaderboardPeriod;
};

export type LeaderboardSnapshotScopeResult = {
  guildId: string | null;
  period: LeaderboardPeriod;
  rowsWritten: number;
};

export type LeaderboardSnapshotRefreshResult = {
  refreshedScopes: number;
  rowsWritten: number;
  scopes: LeaderboardSnapshotScopeResult[];
};
