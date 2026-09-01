import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHealthRouter } from "./health.routes.js";

function makeApp() {
  const app = express();

  app.use(
    "/api/health",
    createHealthRouter({
      monitoring: {
        serviceName: "levelupx-api",
        releaseVersion: "2026.05.23",
        errorTracking: {
          enabled: false,
          provider: "none",
          status: "disabled"
        },
        metrics: {
          enabled: false,
          provider: "none",
          path: "/metrics",
          status: "disabled"
        }
      },
      redis: {
        enabled: true,
        status: "ready",
        url: "redis://localhost:6379",
        namespace: "levelupx-test",
        purposes: ["rate-limit", "leaderboard-cache"]
      },
      backgroundJobsMode: "local-scheduler",
      uptime: () => 42.7
    })
  );

  return app;
}

describe("healthRouter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns liveness and lightweight readiness details", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/levelupx?schema=public");

    const reply = await request(makeApp()).get("/api/health").expect(200);

    expect(reply.body).toMatchObject({
      success: true,
      data: {
        service: "levelupx-api",
        status: "ok",
        releaseVersion: "2026.05.23",
        uptimeSeconds: 42,
        readiness: {
          api: "ready",
          database: "configured",
          backgroundJobs: "local-scheduler",
          metrics: "disabled",
          redis: "ready"
        }
      }
    });
    expect(Date.parse(reply.body.data.timestamp)).not.toBeNaN();
  });

  it("reports missing database configuration without opening a connection", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const reply = await request(makeApp()).get("/api/health").expect(200);

    expect(reply.body.data.readiness.database).toBe("missing-url");
  });
});
