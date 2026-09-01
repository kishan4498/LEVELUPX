import { LeaderboardPeriod } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { publishRealtimeEvent } from "../../realtime/realtime.publisher.js";
import { realtimeEvents } from "../../realtime/realtime.types.js";
import type { ILeaderboardCache } from "./leaderboard.cache.js";
import type { ILeaderboardRepository, LeaderboardCandidate, LeaderboardSnapshotRow } from "./leaderboard.repository.js";
import type { LeaderboardQueryInput, LeaderboardRowDto, LeaderboardSnapshotRefreshResult } from "./leaderboard.types.js";

const SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
const PERIODS = [
  LeaderboardPeriod.DAILY,
  LeaderboardPeriod.WEEKLY,
  LeaderboardPeriod.MONTHLY,
  LeaderboardPeriod.ALL_TIME
];

export class LeaderboardService {
  constructor(
    private readonly repo: ILeaderboardRepository,
    private readonly cache?: ILeaderboardCache
  ) {}

  async getGlobal(query: LeaderboardQueryInput): Promise<LeaderboardRowDto[]> {
    const cached = await this.cache?.getGlobal(query);

    if (cached) {
      return cached;
    }

    const snapshots = await this.repo.findGlobalSnapshot({
      period: query.period,
      limit: query.limit
    });

    if (this.isFreshSnapshot(snapshots)) {
      const rankings = snapshots.map((ranking) => this.toSnapshotDto(ranking));
      await this.cache?.setGlobal(query, rankings);
      return rankings;
    }

    const from = this.getPeriodStart(query.period);
    const candidates = await this.repo.findGlobalCandidates({
      period: query.period,
      from,
      limit: query.limit
    });

    const rankings = this.rank(candidates, query.period).slice(0, query.limit);
    await this.cache?.setGlobal(query, rankings);
    return rankings;
  }

  async refreshSnapshots(refresh: { limit?: number } = {}): Promise<LeaderboardSnapshotRefreshResult> {
    const limit = refresh.limit ?? 100;
    const guildIds = await this.repo.findGuildIds();
    const scopes: LeaderboardSnapshotRefreshResult["scopes"] = [];

    for (const period of PERIODS) {
      const rowsWritten = await this.refreshScope({
        guildId: null,
        period,
        limit
      });
      scopes.push({ guildId: null, period, rowsWritten });
    }

    for (const guildId of guildIds) {
      for (const period of PERIODS) {
        const rowsWritten = await this.refreshScope({
          guildId,
          period,
          limit
        });
        scopes.push({ guildId, period, rowsWritten });
      }
    }

    const summary = {
      refreshedScopes: scopes.length,
      rowsWritten: scopes.reduce((total, scope) => total + scope.rowsWritten, 0),
      scopes
    };

    publishRealtimeEvent({
      name: realtimeEvents.leaderboardSnapshotsRefreshed,
      payload: {
        refreshedScopes: summary.refreshedScopes,
        rowsWritten: summary.rowsWritten,
        scopes: summary.scopes
      }
    });

    // Clear cached rows only after every snapshot write has finished.
    await this.cache?.invalidateAll();

    return summary;
  }

  async getGuild(userId: string, guildId: string, query: LeaderboardQueryInput): Promise<LeaderboardRowDto[]> {
    const member = await this.repo.findGuildMember({ guildId, userId });

    if (!member) {
      throw new AppError("You must be a guild member to view this leaderboard", 403, "GUILD_MEMBERSHIP_REQUIRED");
    }

    const cached = await this.cache?.getGuild({ guildId, query });

    if (cached) {
      return cached;
    }

    const snapshots = await this.repo.findGuildSnapshot({
      guildId,
      period: query.period,
      limit: query.limit
    });

    if (this.isFreshSnapshot(snapshots)) {
      const rankings = snapshots.map((ranking) => this.toSnapshotDto(ranking));
      await this.cache?.setGuild({ guildId, query, rows: rankings });
      return rankings;
    }

    const from = this.getPeriodStart(query.period);
    const candidates = await this.repo.findGuildCandidates({
      guildId,
      period: query.period,
      from,
      limit: query.limit
    });

    const rankings = this.rank(candidates, query.period).slice(0, query.limit);
    await this.cache?.setGuild({ guildId, query, rows: rankings });
    return rankings;
  }

  private rank(candidates: LeaderboardCandidate[], period: LeaderboardPeriod): LeaderboardRowDto[] {
    return candidates
      .map((candidate) => {
        // The profile already stores the running all-time balance.
        const xp =
          period === LeaderboardPeriod.ALL_TIME
            ? candidate.profile?.totalXp ?? 0
            : candidate.xpTransactions.reduce((total, transaction) => total + transaction.amount, 0);
        const focusMinutes = candidate.focusSessions.reduce(
          (total, session) => total + (session.durationMinutes ?? 0),
          0
        );

        return {
          rank: 0,
          userId: candidate.id,
          name: candidate.name,
          xp,
          focusMinutes,
          period
        };
      })
      .sort((left, right) => {
        // Focus time is the tie-breaker for equal XP.
        if (right.xp !== left.xp) {
          return right.xp - left.xp;
        }

        return right.focusMinutes - left.focusMinutes;
      })
      .map((ranking, index) => ({
        ...ranking,
        rank: index + 1
      }));
  }

  private isFreshSnapshot(snapshots: LeaderboardSnapshotRow[]) {
    if (snapshots.length === 0) {
      return false;
    }

    const newest = snapshots.reduce(
      (latest, ranking) => (ranking.updatedAt > latest.updatedAt ? ranking : latest),
      snapshots[0]
    );
    return Date.now() - newest.updatedAt.getTime() <= SNAPSHOT_MAX_AGE_MS;
  }

  private toSnapshotDto(snapshot: LeaderboardSnapshotRow): LeaderboardRowDto {
    return {
      rank: snapshot.rank,
      userId: snapshot.userId,
      name: snapshot.name,
      xp: snapshot.xp,
      focusMinutes: snapshot.focusMinutes,
      period: snapshot.period
    };
  }

  private async refreshScope(scope: { guildId: string | null; period: LeaderboardPeriod; limit: number }) {
    const from = this.getPeriodStart(scope.period);
    const candidates = scope.guildId
      ? await this.repo.findGuildCandidates({
          guildId: scope.guildId,
          period: scope.period,
          from,
          limit: scope.limit
        })
      : await this.repo.findGlobalCandidates({
          period: scope.period,
          from,
          limit: scope.limit
        });
    const rankings = this.rank(candidates, scope.period).slice(0, scope.limit);

    return this.repo.replaceSnapshot({
      guildId: scope.guildId,
      period: scope.period,
      rows: rankings.map((ranking) => ({
        userId: ranking.userId,
        rank: ranking.rank,
        xp: ranking.xp,
        focusMinutes: ranking.focusMinutes
      }))
    });
  }

  private getPeriodStart(period: LeaderboardPeriod): Date | undefined {
    if (period === LeaderboardPeriod.ALL_TIME) {
      return undefined;
    }

    const now = new Date();
    const from = new Date(now);

    if (period === LeaderboardPeriod.DAILY) {
      from.setUTCHours(0, 0, 0, 0);
      return from;
    }

    if (period === LeaderboardPeriod.WEEKLY) {
      from.setUTCDate(now.getUTCDate() - 6);
      from.setUTCHours(0, 0, 0, 0);
      return from;
    }

    from.setUTCDate(now.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);
    return from;
  }
}
