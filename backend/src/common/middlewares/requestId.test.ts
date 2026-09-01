import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { requestIdMiddleware } from "./requestId.js";

function makeApp() {
  const app = express();

  app.use(requestIdMiddleware);
  app.get("/resource", (req, res) => {
    res.json({
      requestId: req.requestId
    });
  });

  return app;
}

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

describe("requestIdMiddleware", () => {
  it("accepts a valid incoming request id", async () => {
    const incomingRes = await request(makeApp()).get("/resource").set("X-Request-Id", "client-request-123").expect(200);

    expect(incomingRes.headers["x-request-id"]).toBe("client-request-123");
    expect(incomingRes.body.requestId).toBe("client-request-123");
  });

  it("generates a request id when none is provided", async () => {
    const generatedRes = await request(makeApp()).get("/resource").expect(200);

    expect(generatedRes.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(generatedRes.body.requestId).toBe(generatedRes.headers["x-request-id"]);
  });

  it("replaces unsafe incoming request ids", async () => {
    const replacedRes = await request(makeApp()).get("/resource").set("X-Request-Id", "bad request id").expect(200);

    expect(replacedRes.headers["x-request-id"]).not.toBe("bad request id");
    expect(replacedRes.body.requestId).toBe(replacedRes.headers["x-request-id"]);
  });
});
