import type { Redis } from "ioredis";

import { redisKey } from "./redisClient.js";

export class RedisDistributedLock {
  constructor(
    private readonly client: Redis,
    private readonly namespace: string
  ) {}

  async acquire(lock: { name: string; owner: string; ttlMs: number }) {
    const key = redisKey(this.namespace, "lock", lock.name);
    const acquired = await this.client.set(key, lock.owner, "PX", lock.ttlMs, "NX");

    return acquired === "OK" ? { key, owner: lock.owner } : null;
  }

  async release(lock: { key: string; owner: string }) {
    await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lock.key,
      lock.owner
    );
  }
}
