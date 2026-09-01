import type { SuperAdminTrustedDevice } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type {
  IAdminTrustedDeviceRepository,
  RevokeAdminTrustedDeviceResult
} from "./adminTrustedDevice.repository.js";
import { AdminTrustedDeviceService } from "./adminTrustedDevice.service.js";

function makeDevice(overrides: Partial<SuperAdminTrustedDevice> = {}): SuperAdminTrustedDevice {
  return {
    id: "device-1",
    userId: "admin-1",
    label: "Owner laptop",
    deviceKeyHash: "stored-hash",
    bindingVersion: 1,
    active: true,
    lastUsedAt: new Date("2026-08-05T08:00:00.000Z"),
    createdAt: new Date("2026-08-01T08:00:00.000Z"),
    updatedAt: new Date("2026-08-05T08:00:00.000Z"),
    ...overrides
  };
}

function makeRepo(
  devices: SuperAdminTrustedDevice[],
  revokeResult: RevokeAdminTrustedDeviceResult = { status: "NOT_FOUND" }
): IAdminTrustedDeviceRepository {
  return {
    async findActiveForUser() {
      return devices;
    },
    async revoke() {
      return revokeResult;
    }
  };
}

describe("AdminTrustedDeviceService", () => {
  it("lists active devices without exposing their stored key hashes", async () => {
    const service = new AdminTrustedDeviceService(makeRepo([makeDevice()]));

    await expect(service.list("admin-1", "device-1")).resolves.toEqual({
      devices: [
        {
          id: "device-1",
          label: "Owner laptop",
          current: true,
          lastUsedAt: "2026-08-05T08:00:00.000Z",
          createdAt: "2026-08-01T08:00:00.000Z"
        }
      ]
    });
  });

  it("revokes a backup device and sends an independent notification", async () => {
    const send = vi.fn().mockResolvedValue({ attempted: true, messageId: "mail-1" });
    const revokedAt = new Date("2026-08-05T09:00:00.000Z");
    const service = new AdminTrustedDeviceService(
      makeRepo([], {
        status: "REVOKED",
        device: makeDevice({ id: "device-2", label: "Recovery laptop" }),
        email: "admin@example.com"
      }),
      { send },
      () => revokedAt
    );

    await expect(service.revoke("admin-1", "device-1", "device-2")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith({
      to: "admin@example.com",
      subject: "LevelUpX trusted device revoked",
      text: expect.stringContaining("Trusted device revoked: Recovery laptop")
    });
  });

  it.each([
    ["NOT_FOUND", "ADMIN_TRUSTED_DEVICE_NOT_FOUND", 404],
    ["CURRENT_DEVICE", "ADMIN_CURRENT_DEVICE_PROTECTED", 409],
    ["LAST_ACTIVE_DEVICE", "ADMIN_LAST_TRUSTED_DEVICE_PROTECTED", 409]
  ] as const)("maps %s repository outcomes to a stable security error", async (status, code, statusCode) => {
    const service = new AdminTrustedDeviceService(makeRepo([], { status }));

    await expect(service.revoke("admin-1", "device-1", "device-2")).rejects.toMatchObject({
      code,
      statusCode
    });
  });

  it("requires every management call to carry a device-bound admin context", async () => {
    const repo = makeRepo([makeDevice()]);
    const service = new AdminTrustedDeviceService(repo);

    await expect(service.list("admin-1", "")).rejects.toMatchObject({
      code: "ADMIN_DEVICE_SESSION_INVALID",
      statusCode: 401
    });
  });
});
