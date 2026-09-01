import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "./errorHandler.js";
import { createRateLimiter } from "./rateLimit.js";

function appWithLimiter(limits: { maxRequests: number; methods?: string[]; now?: () => number }) {
  const app = express();

  app.use(
    createRateLimiter({
      windowMs: 1000,
      maxRequests: limits.maxRequests,
      methods: limits.methods,
      keyGenerator: () => "test-client",
      now: limits.now
    })
  );

  app.get("/resource", (_req, res) => res.json({ ok: true }));
  app.post("/resource", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);

  return app;
}

describe("createRateLimiter", () => {
  it("allows requests within the limit", async () => {
    const app = appWithLimiter({ maxRequests: 2 });

    await request(app).get("/resource").expect(200);
    const allowedRes = await request(app).get("/resource").expect(200);

    expect(allowedRes.headers["ratelimit-limit"]).toBe("2");
    expect(allowedRes.headers["ratelimit-remaining"]).toBe("0");
  });

  it("rejects requests after the limit is exceeded", async () => {
    const app = appWithLimiter({ maxRequests: 1 });

    await request(app).get("/resource").expect(200);
    const limitedRes = await request(app).get("/resource").expect(429);

    expect(limitedRes.body).toEqual({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests"
      }
    });
    expect(limitedRes.headers["retry-after"]).toBe("1");
  });

  it("resets the client bucket after the window", async () => {
    let currentTime = 0;
    const app = appWithLimiter({
      maxRequests: 1,
      now: () => currentTime
    });

    await request(app).get("/resource").expect(200);
    await request(app).get("/resource").expect(429);

    currentTime = 1001;
    await request(app).get("/resource").expect(200);
  });

  it("can be scoped to specific methods", async () => {
    const app = appWithLimiter({
      maxRequests: 1,
      methods: ["POST"]
    });

    await request(app).get("/resource").expect(200);
    await request(app).get("/resource").expect(200);
    await request(app).post("/resource").expect(200);
    await request(app).post("/resource").expect(429);
  });
});
