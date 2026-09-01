import { LeaderboardPeriod } from "@prisma/client";
import type { Redis } from "ioredis";

import { redisKey } from "../../common/redis/redisClient.js";
import type { LeaderboardQueryInput, LeaderboardRowDto } from "./leaderboard.types.js";

const CACHE_TTL_SECS = 60;

export interface ILeaderboardCache {
  getGlobal(query: LeaderboardQueryInput): Promise<LeaderboardRowDto[] | null>;
  setGlobal(query: LeaderboardQueryInput, rankings: LeaderboardRowDto[]): Promise<void>;
  getGuild(guildQuery: { guildId: string; query: LeaderboardQueryInput }): Promise<LeaderboardRowDto[] | null>;
  setGuild(snapshot: { guildId: string; query: LeaderboardQueryInput; rows: LeaderboardRowDto[] }): Promise<void>;
  invalidateAll(): Promise<void>;
}

export class RedisLeaderboardCache implements ILeaderboardCache {
  constructor(
    private readonly client: Redis,
    private readonly namespace: string
  ) {}

  async getGlobal(query: LeaderboardQueryInput) {
    return this.read(this.key("global", query.period, query.limit));
  }

  async setGlobal(query: LeaderboardQueryInput, rankings: LeaderboardRowDto[]) {
    await this.write(this.key("global", query.period, query.limit), rankings);
  }

  async getGuild(guildQuery: { guildId: string; query: LeaderboardQueryInput }) {
    return this.read(this.key("guild", guildQuery.guildId, guildQuery.query.period, guildQuery.query.limit));
  }

  async setGuild(snapshot: { guildId: string; query: LeaderboardQueryInput; rows: LeaderboardRowDto[] }) {
    await this.write(this.key("guild", snapshot.guildId, snapshot.query.period, snapshot.query.limit), snapshot.rows);
  }

  async invalidateAll() {
    // SCAN keeps invalidation from blocking Redis as the cache grows.
    const stream = this.client.scanStream({
      match: redisKey(this.namespace, "leaderboard", "*"),
      count: 100
    });

    for await (const keys of stream) {
      const batch = keys as string[];
      if (batch.length > 0) {
        await this.client.del(...batch);
      }
    }
  }

  private async read(key: string) {
    const json = await this.client.get(key);

    if (!json) {
      return null;
    }

    const rankings = JSON.parse(json) as LeaderboardRowDto[];
    return rankings.map((ranking) => ({
      ...ranking,
      period: ranking.period as LeaderboardPeriod
    }));
  }

  private async write(key: string, rankings: LeaderboardRowDto[]) {
    await this.client.set(key, JSON.stringify(rankings), "EX", CACHE_TTL_SECS);
  }

  private key(...parts: Array<string | number>) {
    return redisKey(this.namespace, "leaderboard", ...parts.map(String));
  }
}
