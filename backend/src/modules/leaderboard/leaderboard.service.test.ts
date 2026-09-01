import { LeaderboardPeriod, type GuildRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ILeaderboardRepository, LeaderboardCandidate, LeaderboardSnapshotRow } from "./leaderboard.repository.js";
import { LeaderboardService } from "./leaderboard.service.js";
import type { ILeaderboardCache } from "./leaderboard.cache.js";

function makeCandidate(candidate: {
  id: string;
  name: string;
  totalXp: number;
  transactionXp?: number[];
  focusMinutes?: number[];
}): LeaderboardCandidate {
  return {
    id: candidate.id,
    name: candidate.name,
    profile: {
      totalXp: candidate.totalXp
    },
    xpTransactions: (candidate.transactionXp ?? []).map((amount) => ({ amount })),
    focusSessions: (candidate.focusMinutes ?? []).map((durationMinutes) => ({ durationMinutes }))
  };
}

function makeRepo(overrides: Partial<ILeaderboardRepository> = {}): ILeaderboardRepository {
  return {
    async findGlobalCandidates() {
      return [];
    },
    async findGlobalSnapshot() {
      return [];
    },
    async findGuildCandidates() {
      return [];
    },
    async findGuildSnapshot() {
      return [];
    },
    async findGuildMember(): Promise<{ role: GuildRole } | null> {
      return null;
    },
    async findGuildIds() {
      return [];
    },
    async replaceSnapshot() {
      return 0;
    },
    ...overrides
  };
}

function makeSnapshotRow(snapshot: Partial<LeaderboardSnapshotRow> = {}): LeaderboardSnapshotRow {
  return {
    rank: 1,
    userId: "snapshot-user",
    name: "Snapshot User",
    xp: 500,
    focusMinutes: 40,
    period: LeaderboardPeriod.WEEKLY,
    updatedAt: new Date(),
    ...snapshot
  };
}

function makeCache(overrides: Partial<ILeaderboardCache> = {}): ILeaderboardCache {
  return {
    async getGlobal() {
      return null;
    },
    async setGlobal() {},
    async getGuild() {
      return null;
    },
    async setGuild() {},
    async invalidateAll() {},
    ...overrides
  };
}

describe("LeaderboardService snapshots", () => {
  it("uses fresh global snapshots before live ranking", async () => {
    let liveCalls = 0;
    const service = new LeaderboardService(
      makeRepo({
        async findGlobalSnapshot() {
          return [makeSnapshotRow()];
        },
        async findGlobalCandidates() {
          liveCalls += 1;
          return [];
        }
      })
    );

    const rankings = await service.getGlobal({
      period: LeaderboardPeriod.WEEKLY,
      limit: 10
    });

    expect(rankings).toEqual([
      {
        rank: 1,
        userId: "snapshot-user",
        name: "Snapshot User",
        xp: 500,
        focusMinutes: 40,
        period: LeaderboardPeriod.WEEKLY
      }
    ]);
    expect(liveCalls).toBe(0);
  });

  it("uses cached global leaderboard rows before repository reads", async () => {
    let snapshotReads = 0;
    const service = new LeaderboardService(
      makeRepo({
        async findGlobalSnapshot() {
          snapshotReads += 1;
          return [];
        }
      }),
      makeCache({
        async getGlobal() {
          return [
            {
              rank: 1,
              userId: "cached-user",
              name: "Cached User",
              xp: 900,
              focusMinutes: 20,
              period: LeaderboardPeriod.WEEKLY
            }
          ];
        }
      })
    );

    await expect(service.getGlobal({ period: LeaderboardPeriod.WEEKLY, limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        userId: "cached-user",
        xp: 900
      })
    ]);
    expect(snapshotReads).toBe(0);
  });

  it("falls back to live global ranking when snapshots are stale", async () => {
    let liveCalls = 0;
    const service = new LeaderboardService(
      makeRepo({
        async findGlobalSnapshot() {
          return [
            makeSnapshotRow({
              updatedAt: new Date(Date.now() - 16 * 60 * 1000)
            })
          ];
        },
        async findGlobalCandidates() {
          liveCalls += 1;
          return [
            makeCandidate({
              id: "live-user",
              name: "Live User",
              totalXp: 0,
              transactionXp: [75],
              focusMinutes: [20]
            })
          ];
        }
      })
    );

    const rankings = await service.getGlobal({
      period: LeaderboardPeriod.WEEKLY,
      limit: 10
    });

    expect(liveCalls).toBe(1);
    expect(rankings).toEqual([
      {
        rank: 1,
        userId: "live-user",
        name: "Live User",
        xp: 75,
        focusMinutes: 20,
        period: LeaderboardPeriod.WEEKLY
      }
    ]);
  });

  it("uses fresh guild snapshots after membership is verified", async () => {
    let liveCalls = 0;
    const service = new LeaderboardService(
      makeRepo({
        async findGuildMember() {
          return { role: "MEMBER" as GuildRole };
        },
        async findGuildSnapshot() {
          return [
            makeSnapshotRow({
              userId: "guild-snapshot-user",
              name: "Guild Snapshot User",
              period: LeaderboardPeriod.MONTHLY
            })
          ];
        },
        async findGuildCandidates() {
          liveCalls += 1;
          return [];
        }
      })
    );

    const rankings = await service.getGuild("viewer-1", "guild-1", {
      period: LeaderboardPeriod.MONTHLY,
      limit: 10
    });

    expect(rankings[0]).toMatchObject({
      userId: "guild-snapshot-user",
      name: "Guild Snapshot User",
      period: LeaderboardPeriod.MONTHLY
    });
    expect(liveCalls).toBe(0);
  });

  it("refreshes global and guild snapshots with ranked rows", async () => {
    const saved: {
      guildId: string | null;
      period: LeaderboardPeriod;
      rows: { userId: string; rank: number; xp: number; focusMinutes: number }[];
    }[] = [];
    const repo: ILeaderboardRepository = makeRepo({
      async findGlobalCandidates(query) {
        return [
          makeCandidate({
            id: "user-low",
            name: "Low XP",
            totalXp: 100,
            transactionXp: query.period === LeaderboardPeriod.ALL_TIME ? [] : [10],
            focusMinutes: [60]
          }),
          makeCandidate({
            id: "user-high",
            name: "High XP",
            totalXp: 500,
            transactionXp: query.period === LeaderboardPeriod.ALL_TIME ? [] : [50],
            focusMinutes: [30]
          })
        ];
      },
      async findGuildCandidates(query) {
        return [
          makeCandidate({
            id: `guild-user-${query.guildId}`,
            name: "Guild User",
            totalXp: 300,
            transactionXp: query.period === LeaderboardPeriod.ALL_TIME ? [] : [40],
            focusMinutes: [20]
          })
        ];
      },
      async findGuildIds() {
        return ["guild-1"];
      },
      async replaceSnapshot(snapshot) {
        saved.push(snapshot);
        return snapshot.rows.length;
      }
    });

    let cacheCleared = false;
    const refresh = await new LeaderboardService(
      repo,
      makeCache({
        async invalidateAll() {
          cacheCleared = true;
        }
      })
    ).refreshSnapshots({ limit: 2 });

    expect(refresh.refreshedScopes).toBe(8);
    expect(refresh.rowsWritten).toBe(12);
    expect(saved).toHaveLength(8);
    expect(saved[0]).toMatchObject({
      guildId: null,
      period: LeaderboardPeriod.DAILY,
      rows: [
        { userId: "user-high", rank: 1, xp: 50, focusMinutes: 30 },
        { userId: "user-low", rank: 2, xp: 10, focusMinutes: 60 }
      ]
    });
    expect(saved[3]).toMatchObject({
      guildId: null,
      period: LeaderboardPeriod.ALL_TIME,
      rows: [
        { userId: "user-high", rank: 1, xp: 500, focusMinutes: 30 },
        { userId: "user-low", rank: 2, xp: 100, focusMinutes: 60 }
      ]
    });
    expect(saved[4]).toMatchObject({
      guildId: "guild-1",
      period: LeaderboardPeriod.DAILY,
      rows: [{ userId: "guild-user-guild-1", rank: 1, xp: 40, focusMinutes: 20 }]
    });
    expect(cacheCleared).toBe(true);
  });
});
