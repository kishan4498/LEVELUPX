import { randomUUID } from "node:crypto";

import { type LogLevel, writeLog } from "../common/logger/logger.js";
import { getRedisClient, redisPurposeEnabled } from "../common/redis/redisClient.js";
import { RedisDistributedLock } from "../common/redis/redisLock.js";
import { resolveRedisRuntimeConfig } from "../config/redis.js";
import type { Job, JobCtx, RunResult } from "./job.types.js";

export type JobRunOptions = {
  logLevel?: LogLevel;
  startedAt?: Date;
  lockTtlMs?: number;
};

export async function runJobs(jobs: Job[], opts: JobRunOptions = {}) {
  const startedAt = opts.startedAt ?? new Date();
  const ctx: JobCtx = { startedAt };
  const runs: RunResult[] = [];
  const redis = resolveRedisRuntimeConfig();
  const client = redisPurposeEnabled(redis, "distributed-lock") ? getRedisClient(redis) : null;
  const lock = client ? new RedisDistributedLock(client, redis.namespace) : null;

  for (const job of jobs) {
    const owner = randomUUID();
    // Prevent two workers from running the same stateful job at once.
    const acquired = lock
      ? await lock.acquire({
          name: `job:${job.name}`,
          owner,
          ttlMs: opts.lockTtlMs ?? 30 * 60 * 1000
        })
      : null;

    if (lock && !acquired) {
      runs.push({
        name: job.name,
        status: "skipped",
        message: "Background job skipped because another worker holds the distributed lock.",
        metadata: {
          lock: "busy"
        }
      });
      continue;
    }

    writeLog(
      {
        level: "info",
        message: "Background job started",
        job: job.name
      },
      opts.logLevel
    );

    try {
      const run = await job.run(ctx);
      runs.push(run);

      writeLog(
        {
          level: "info",
          message: "Background job finished",
          job: run.name,
          status: run.status
        },
        opts.logLevel
      );
    } catch (error) {
      const failure: RunResult = {
        name: job.name,
        status: "failed",
        message: "Background job failed",
        error: jobError(error)
      };

      runs.push(failure);

      writeLog(
        {
          level: "error",
          message: failure.message,
          job: failure.name,
          error: failure.error
        },
        opts.logLevel
      );
    }

    if (lock && acquired) {
      // The TTL is the fallback if the worker dies before this release.
      await lock.release(acquired);
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    total: runs.length,
    completed: runs.filter((run) => run.status === "completed").length,
    skipped: runs.filter((run) => run.status === "skipped").length,
    failed: runs.filter((run) => run.status === "failed").length,
    results: runs
  };
}

function jobError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown job error";
}
