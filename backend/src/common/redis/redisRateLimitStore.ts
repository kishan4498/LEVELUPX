import type { Redis } from "ioredis";

import { redisKey } from "./redisClient.js";

export type RateLimitHit = {
  count: number;
  resetAt: number;
};

export interface RateLimitStore {
  hit(hit: { key: string; windowMs: number; now: number }): Promise<RateLimitHit>;
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: Redis,
    private readonly namespace: string
  ) {}

  async hit(hit: { key: string; windowMs: number; now: number }): Promise<RateLimitHit> {
    const key = redisKey(this.namespace, "rate-limit", hit.key);
    const count = await this.client.incr(key);

    if (count === 1) {
      await this.client.pexpire(key, hit.windowMs);
    }

    const ttlMs = await this.client.pttl(key);
    const resetAt = hit.now + (ttlMs > 0 ? ttlMs : hit.windowMs);

    return { count, resetAt };
  }
}
