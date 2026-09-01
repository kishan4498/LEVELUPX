import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createMetricsRouter } from "./metrics.routes.js";

const METRICS_TOKEN = "metrics-test-token-with-at-least-32-characters";

function makeApp(metrics: { enabled: boolean; serviceName?: string; authToken?: string }) {
  const app = express();

  app.use(
    "/metrics",
    createMetricsRouter({
      serviceName: metrics.serviceName ?? "levelupx-api",
      errorTracking: {
        enabled: false,
        provider: "none",
        status: "disabled"
      },
      metrics: {
        enabled: metrics.enabled,
        provider: metrics.enabled ? "prometheus" : "none",
        path: "/metrics",
        authToken: metrics.authToken,
        status: metrics.enabled ? (metrics.authToken ? "ready" : "missing-auth") : "disabled"
      }
    })
  );

  return app;
}

describe("metricsRouter", () => {
  it("returns a disabled response when metrics are not enabled", async () => {
    const reply = await request(makeApp({ enabled: false })).get("/metrics").expect(404);

    expect(reply.body).toEqual({
      success: false,
      error: {
        code: "METRICS_DISABLED",
        message: "Metrics endpoint is disabled"
      }
    });
  });

  it("returns Prometheus metrics when metrics are enabled", async () => {
    const reply = await request(
      makeApp({ enabled: true, serviceName: "levelupx-api", authToken: METRICS_TOKEN })
    )
      .get("/metrics")
      .set("Authorization", `Bearer ${METRICS_TOKEN}`)
      .expect(200);

    expect(reply.headers["content-type"]).toContain("text/plain");
    expect(reply.text).toContain("# HELP levelupx_http_requests_total");
    expect(reply.text).toContain("# HELP levelupx_http_request_duration_seconds");
    expect(reply.text).toContain('levelupx_build_info{service="levelupx-api",release="unknown"} 1');
  });

  it("rejects scrapes without the configured bearer token", async () => {
    const reply = await request(makeApp({ enabled: true, authToken: METRICS_TOKEN }))
      .get("/metrics")
      .expect(401);

    expect(reply.body.error.code).toBe("METRICS_AUTH_REQUIRED");
    expect(reply.headers["www-authenticate"]).toBe("Bearer");
  });

  it("refuses to expose metrics when authentication is missing", async () => {
    const reply = await request(makeApp({ enabled: true })).get("/metrics").expect(503);

    expect(reply.body.error.code).toBe("METRICS_AUTH_NOT_CONFIGURED");
  });
});
