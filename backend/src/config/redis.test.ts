import { describe, expect, it } from "vitest";

import { resolveRedisRuntimeConfig } from "./redis.js";

describe("resolveRedisRuntimeConfig", () => {
  it("keeps Redis disabled unless explicitly enabled", () => {
    expect(resolveRedisRuntimeConfig({})).toEqual({
      enabled: false,
      status: "disabled",
      namespace: "levelupx",
      purposes: []
    });
  });

  it("reports missing-url when Redis is enabled without a URL", () => {
    expect(
      resolveRedisRuntimeConfig({
        REDIS_ENABLED: "true",
        REDIS_NAMESPACE: "levelupx-prod"
      })
    ).toEqual({
      enabled: true,
      status: "missing-url",
      namespace: "levelupx-prod",
      purposes: ["rate-limit", "job-queue", "leaderboard-cache", "distributed-lock"]
    });
  });

  it("returns a ready config with known purposes only", () => {
    expect(
      resolveRedisRuntimeConfig({
        REDIS_ENABLED: "true",
        REDIS_URL: " redis://localhost:6379 ",
        REDIS_NAMESPACE: "levelupx-dev",
        REDIS_PURPOSES: "rate-limit,unknown,leaderboard-cache"
      })
    ).toEqual({
      enabled: true,
      status: "ready",
      url: "redis://localhost:6379",
      namespace: "levelupx-dev",
      purposes: ["rate-limit", "leaderboard-cache"]
    });
  });
});
