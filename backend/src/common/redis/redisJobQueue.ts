import type { Redis } from "ioredis";

import { redisKey } from "./redisClient.js";

export type RedisQueuedJob = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  enqueuedAt: string;
};

export class RedisJobQueue {
  constructor(
    private readonly client: Redis,
    private readonly namespace: string
  ) {}

  async enqueue(spec: { id: string; name: string; payload?: Record<string, unknown>; maxAttempts?: number }) {
    const job: RedisQueuedJob = {
      id: spec.id,
      name: spec.name,
      payload: spec.payload ?? {},
      attempts: 0,
      maxAttempts: spec.maxAttempts ?? 3,
      enqueuedAt: new Date().toISOString()
    };

    await this.client.rpush(this.pendingKey(spec.name), JSON.stringify(job));
    return job;
  }

  async leaseNext(name: string) {
    const serialized = await this.client.lpop(this.pendingKey(name));

    if (!serialized) {
      return null;
    }

    const job = JSON.parse(serialized) as RedisQueuedJob;
    await this.client.hset(this.processingKey(name), job.id, JSON.stringify(job));

    return job;
  }

  async complete(job: RedisQueuedJob) {
    await this.client.hdel(this.processingKey(job.name), job.id);
  }

  async failAndRetry(job: RedisQueuedJob, error: string) {
    const next = {
      ...job,
      attempts: job.attempts + 1
    };

    await this.client.hdel(this.processingKey(job.name), job.id);

    if (next.attempts >= next.maxAttempts) {
      await this.client.rpush(this.deadLetterKey(job.name), JSON.stringify({ ...next, error }));
      return "dead-lettered" as const;
    }

    await this.client.rpush(this.pendingKey(job.name), JSON.stringify(next));
    return "retried" as const;
  }

  private pendingKey(name: string) {
    return redisKey(this.namespace, "queue", name, "pending");
  }

  private processingKey(name: string) {
    return redisKey(this.namespace, "queue", name, "processing");
  }

  private deadLetterKey(name: string) {
    return redisKey(this.namespace, "queue", name, "dead-letter");
  }
}
