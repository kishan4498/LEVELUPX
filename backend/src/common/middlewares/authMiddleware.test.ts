import { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthRequest } from "../types/auth.types.js";

const accessSecret = "test-access-secret-with-at-least-32-characters";

async function loadAuthMiddleware() {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/levelupx_test?schema=public");
  vi.stubEnv("JWT_ACCESS_SECRET", accessSecret);
  vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret-with-at-least-32-characters");

  return import("./authMiddleware.js");
}

function createToken(type: "access" | "refresh" = "access") {
  return jwt.sign(
    {
      id: "user-1",
      email: "user@example.com",
      role: Role.USER,
      type
    },
    accessSecret
  );
}

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a valid access token", async () => {
    const { verifyAccessToken } = await loadAuthMiddleware();

    expect(verifyAccessToken(createToken())).toEqual({
      id: "user-1",
      email: "user@example.com",
      role: Role.USER,
      adminVerified: undefined,
      passkeyVerified: undefined,
      adminDeviceId: undefined,
      adminDeviceVersion: undefined,
      tokenIssuedAt: expect.any(Number)
    });
  });

  it("rejects a token with the wrong type", async () => {
    const { verifyAccessToken } = await loadAuthMiddleware();

    expect(() => verifyAccessToken(createToken("refresh"))).toThrow("Invalid access token");
  });

  it("rejects requests without a bearer token", async () => {
    const { authMiddleware } = await loadAuthMiddleware();
    const req = {
      headers: {}
    } as AuthRequest;
    const next = vi.fn();

    authMiddleware(req, {} as never, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "AUTH_REQUIRED",
        statusCode: 401
      })
    );
  });

  it("rejects invalid bearer tokens", async () => {
    const { authMiddleware } = await loadAuthMiddleware();
    const req = {
      headers: {
        authorization: "Bearer not-a-real-token"
      }
    } as AuthRequest;
    const next = vi.fn();

    authMiddleware(req, {} as never, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "INVALID_TOKEN",
        statusCode: 401
      })
    );
  });

  it("attaches the authenticated user for valid access tokens", async () => {
    const { authMiddleware } = await loadAuthMiddleware();
    const req = {
      headers: {
        authorization: `Bearer ${createToken()}`
      }
    } as AuthRequest;
    const next = vi.fn();

    authMiddleware(req, {} as never, next);

    expect(req.user).toEqual({
      id: "user-1",
      email: "user@example.com",
      role: Role.USER,
      adminVerified: undefined,
      adminDeviceId: undefined,
      adminDeviceVersion: undefined,
      tokenIssuedAt: expect.any(Number)
    });
    expect(next).toHaveBeenCalledWith();
  });
});
