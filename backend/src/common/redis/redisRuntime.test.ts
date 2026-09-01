import { describe, expect, it } from "vitest";

import { RedisJobQueue } from "./redisJobQueue.js";
import { RedisDistributedLock } from "./redisLock.js";
import { RedisRateLimitStore } from "./redisRateLimitStore.js";

class FakeRedis {
  values = new Map<string, string>();
  expires = new Map<string, number>();
  lists = new Map<string, string[]>();
  hashes = new Map<string, Map<string, string>>();

  async incr(key: string) {
    const nextCount = Number(this.values.get(key) ?? 0) + 1;
    this.values.set(key, String(nextCount));
    return nextCount;
  }

  async pexpire(key: string, ttlMs: number) {
    this.expires.set(key, ttlMs);
  }

  async pttl(key: string) {
    return this.expires.get(key) ?? -1;
  }

  async set(key: string, stored: string, _px: "PX", _ttlMs: number, _mode: "NX") {
    if (this.values.has(key)) {
      return null;
    }

    this.values.set(key, stored);
    return "OK";
  }

  async eval(_script: string, _keyCount: number, key: string, owner: string) {
    if (this.values.get(key) === owner) {
      this.values.delete(key);
      return 1;
    }

    return 0;
  }

  async rpush(key: string, serialized: string) {
    const queue = this.lists.get(key) ?? [];
    queue.push(serialized);
    this.lists.set(key, queue);
    return queue.length;
  }

  async lpop(key: string) {
    return this.lists.get(key)?.shift() ?? null;
  }

  async hset(key: string, field: string, stored: string) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, stored);
    this.hashes.set(key, hash);
  }

  async hdel(key: string, field: string) {
    this.hashes.get(key)?.delete(field);
  }
}

describe("Redis runtime clients", () => {
  it("increments shared rate-limit buckets with a reset timestamp", async () => {
    const redis = new FakeRedis();
    const store = new RedisRateLimitStore(redis as never, "levelupx-test");

    await expect(store.hit({ key: "client-1", windowMs: 1000, now: 2000 })).resolves.toEqual({
      count: 1,
      resetAt: 3000
    });
  });

  it("acquires and releases distributed locks by owner", async () => {
    const redis = new FakeRedis();
    const lock = new RedisDistributedLock(redis as never, "levelupx-test");

    const acquired = await lock.acquire({ name: "job:test", owner: "worker-1", ttlMs: 1000 });

    expect(acquired).toEqual({
      key: "levelupx-test:lock:job:test",
      owner: "worker-1"
    });
    await expect(lock.acquire({ name: "job:test", owner: "worker-2", ttlMs: 1000 })).resolves.toBeNull();

    await lock.release(acquired!);
    await expect(lock.acquire({ name: "job:test", owner: "worker-2", ttlMs: 1000 })).resolves.toMatchObject({
      owner: "worker-2"
    });
  });

  it("leases queued jobs and dead-letters after max attempts", async () => {
    const redis = new FakeRedis();
    const queue = new RedisJobQueue(redis as never, "levelupx-test");

    await queue.enqueue({ id: "job-1", name: "weekly-report", maxAttempts: 1 });
    const leased = await queue.leaseNext("weekly-report");

    expect(leased).toMatchObject({
      id: "job-1",
      name: "weekly-report",
      attempts: 0,
      maxAttempts: 1
    });
    await expect(queue.failAndRetry(leased!, "boom")).resolves.toBe("dead-lettered");
  });
});
