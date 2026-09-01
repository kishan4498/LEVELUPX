import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { createApp as createAppType } from "./app.js";

let app: ReturnType<typeof createAppType>;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/levelupx_test?schema=public");
  vi.stubEnv("JWT_ACCESS_SECRET", "test-access-secret-with-at-least-32-characters");
  vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret-with-at-least-32-characters");

  const module = await import("./app.js");
  app = module.createApp();
}, 30_000);

describe("LevelUpX app integration", () => {
  it("returns health status", async () => {
    const healthRes = await request(app).get("/api/health").expect(200);

    expect(healthRes.body).toMatchObject({
      success: true,
      data: {
        service: "levelupx-api",
        status: "ok",
        readiness: {
          api: "ready",
          database: "configured"
        }
      }
    });
    expect(Date.parse(healthRes.body.data.timestamp)).not.toBeNaN();
  });

  it("returns a consistent not-found response", async () => {
    const missingRes = await request(app).get("/api/missing-route").expect(404);

    expect(missingRes.body).toEqual({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route GET /api/missing-route was not found"
      }
    });
  });

  it("validates auth register payloads before hitting the database", async () => {
    const validationRes = await request(app)
      .post("/api/auth/register")
      .send({
        name: "A",
        email: "not-an-email",
        password: "short"
      })
      .expect(400);

    expect(validationRes.body.success).toBe(false);
    expect(validationRes.body.error.code).toBe("VALIDATION_ERROR");
    expect(validationRes.body.error.details.fieldErrors).toMatchObject({
      name: expect.any(Array),
      email: expect.any(Array),
      password: expect.any(Array)
    });
  });

  it("rejects protected routes without an access token", async () => {
    const authRes = await request(app).get("/api/rewards/summary").expect(401);

    expect(authRes.body).toEqual({
      success: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication required"
      }
    });
  });

  it("exposes download filenames to the browser", async () => {
    const preflightRes = await request(app)
      .options("/api/account/export")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);

    expect(preflightRes.headers["access-control-expose-headers"]).toContain("Content-Disposition");
  });
});
