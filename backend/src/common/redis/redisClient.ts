import { Redis, type Redis as RedisClient } from "ioredis";

import { resolveRedisRuntimeConfig, type RedisRuntimeConfig, type RedisRuntimePurpose } from "../../config/redis.js";
import { writeLog } from "../logger/logger.js";

let shared: RedisClient | null = null;

export function getRedisClient(redis: RedisRuntimeConfig = resolveRedisRuntimeConfig()) {
  if (redis.status !== "ready" || !redis.url) {
    return null;
  }

  if (!shared) {
    shared = new Redis(redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });

    shared.on("error", (error: Error) => {
      writeLog({
        level: "warn",
        message: "redis_client_error",
        error: error.message
      });
    });
  }

  return shared;
}

export function redisPurposeEnabled(redis: RedisRuntimeConfig, purpose: RedisRuntimePurpose) {
  return redis.status === "ready" && redis.purposes.includes(purpose);
}

export function redisKey(namespace: string, ...parts: string[]) {
  // Normalize user-provided parts to prevent ambiguous Redis paths.
  return [namespace, ...parts.map((part) => part.replaceAll(/[^a-zA-Z0-9:_-]/g, "_"))].join(":");
}

export async function closeRedisClient() {
  if (!shared) {
    return;
  }

  const client = shared;
  shared = null;
  client.disconnect();
}
