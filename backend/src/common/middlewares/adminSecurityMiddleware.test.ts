import { Role, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthRequest } from "../types/auth.types.js";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  countPasskeys: vi.fn()
}));

vi.mock("../../prisma/client.js", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    adminPasskey: { count: mocks.countPasskeys }
  }
}));

import { requireBaseVerifiedAdminSession } from "./adminSecurityMiddleware.js";

function makeRequest(): AuthRequest {
  return {
    user: {
      id: "admin-1",
      email: "admin@example.com",
      role: Role.ADMIN,
      adminVerified: true,
      passkeyVerified: true,
      adminDeviceId: "device-1",
      adminDeviceVersion: 1,
      tokenIssuedAt: Math.floor(Date.now() / 1000)
    }
  } as AuthRequest;
}

function makeDatabaseUser(devices: Array<{ id: string; bindingVersion: number }>) {
  return {
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    twoStepEnabled: true,
    updatedAt: new Date(Date.now() - 5_000),
    superAdminTrustedDevices: devices
  };
}

describe("requireBaseVerifiedAdminSession", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
  });

  it("accepts an admin token while its bound device remains active", async () => {
    mocks.findUnique.mockResolvedValue(
      makeDatabaseUser([{ id: "device-1", bindingVersion: 1 }])
    );
    const next = vi.fn();

    await requireBaseVerifiedAdminSession(makeRequest(), {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects an old token even when the device key rotates in the same second", async () => {
    mocks.findUnique.mockResolvedValue(makeDatabaseUser([{ id: "device-1", bindingVersion: 2 }]));
    const next = vi.fn();

    await requireBaseVerifiedAdminSession(makeRequest(), {} as never, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ADMIN_DEVICE_SESSION_INVALID",
        statusCode: 401
      })
    );
  });

  it("rejects an otherwise valid admin token after its device is revoked", async () => {
    mocks.findUnique.mockResolvedValue(makeDatabaseUser([]));
    const next = vi.fn();

    await requireBaseVerifiedAdminSession(makeRequest(), {} as never, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ADMIN_DEVICE_SESSION_INVALID",
        statusCode: 401
      })
    );
  });
});
