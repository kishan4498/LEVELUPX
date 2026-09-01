import { Router } from "express";

import { resolveBackgroundJobsMode, type BackgroundJobsMode } from "../../config/backgroundJobs.js";
import type { MonitoringRuntimeConfig } from "../../config/monitoring.js";
import { resolveMonitoringRuntimeConfig } from "../../config/monitoring.js";
import type { RedisRuntimeConfig } from "../../config/redis.js";
import { resolveRedisRuntimeConfig } from "../../config/redis.js";

export function createHealthRouter(
  runtime: {
    monitoring?: MonitoringRuntimeConfig;
    redis?: RedisRuntimeConfig;
    backgroundJobsMode?: BackgroundJobsMode;
    uptime?: () => number;
  } = {}
) {
  const router = Router();
  const monitoring = runtime.monitoring ?? resolveMonitoringRuntimeConfig();
  const redis = runtime.redis ?? resolveRedisRuntimeConfig();
  const jobsMode = runtime.backgroundJobsMode ?? resolveBackgroundJobsMode();
  const uptime = runtime.uptime ?? process.uptime;

  router.get("/", (_req, res) => {
    res.json({
      success: true,
      data: {
        service: monitoring.serviceName,
        status: "ok",
        releaseVersion: monitoring.releaseVersion,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(uptime()),
        readiness: {
          api: "ready",
          database: process.env.DATABASE_URL ? "configured" : "missing-url",
          backgroundJobs: jobsMode,
          metrics: monitoring.metrics.status,
          redis: redis.status
        }
      }
    });
  });

  return router;
}

export const healthRouter = createHealthRouter();
