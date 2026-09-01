import { timingSafeEqual } from "node:crypto";

import { Router } from "express";

import type { MonitoringRuntimeConfig } from "../../config/monitoring.js";
import { resolveMonitoringRuntimeConfig } from "../../config/monitoring.js";
import { prometheusContentType, renderPrometheusMetrics } from "../../common/monitoring/metrics.js";

export function createMetricsRouter(monitoring: MonitoringRuntimeConfig = resolveMonitoringRuntimeConfig()) {
  const router = Router();

  router.get("/", async (req, res) => {
    if (!monitoring.metrics.enabled) {
      return res.status(404).json({
        success: false,
        error: {
          code: "METRICS_DISABLED",
          message: "Metrics endpoint is disabled"
        }
      });
    }

    if (monitoring.metrics.status !== "ready" || !monitoring.metrics.authToken) {
      return res.status(503).json({
        success: false,
        error: {
          code: "METRICS_AUTH_NOT_CONFIGURED",
          message: "Metrics authentication is not configured"
        }
      });
    }

    const authorization = req.get("authorization");

    if (!matchesBearerToken(authorization, monitoring.metrics.authToken)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return res.status(401).json({
        success: false,
        error: {
          code: "METRICS_AUTH_REQUIRED",
          message: "Metrics authentication required"
        }
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.type(prometheusContentType()).send(
      await renderPrometheusMetrics({
        serviceName: monitoring.serviceName,
        releaseVersion: monitoring.releaseVersion
      })
    );
  });

  return router;
}

export const metricsRouter = createMetricsRouter();

function matchesBearerToken(header: string | undefined, token: string) {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(token, "utf8");

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
