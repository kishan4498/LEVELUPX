import * as Sentry from "@sentry/node";

import type { MonitoringRuntimeConfig } from "../../config/monitoring.js";
import { resolveMonitoringRuntimeConfig } from "../../config/monitoring.js";
import { writeLog } from "../logger/logger.js";

let initialized = false;

export function initializeErrorTracking(monitoring: MonitoringRuntimeConfig = resolveMonitoringRuntimeConfig()) {
  if (initialized || monitoring.errorTracking.status !== "ready") {
    return initialized;
  }

  Sentry.init({
    dsn: monitoring.errorTracking.dsn,
    release: monitoring.releaseVersion,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1
  });

  initialized = true;

  writeLog({
    level: "info",
    message: "error_tracking_initialized",
    provider: monitoring.errorTracking.provider,
    serviceName: monitoring.serviceName,
    releaseVersion: monitoring.releaseVersion ?? null
  });

  return initialized;
}

export function captureUnhandledError(
  error: unknown,
  request: {
    requestId?: string;
    method?: string;
    path?: string;
    statusCode?: number;
  },
  monitoring: MonitoringRuntimeConfig = resolveMonitoringRuntimeConfig()
) {
  if (!initializeErrorTracking(monitoring)) {
    return;
  }

  Sentry.captureException(error, {
    tags: {
      requestId: request.requestId ?? "unknown",
      method: request.method ?? "unknown",
      path: request.path ?? "unknown",
      statusCode: String(request.statusCode ?? 500)
    },
    extra: {
      serviceName: monitoring.serviceName,
      releaseVersion: monitoring.releaseVersion ?? null
    }
  });
}
