import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../prisma/client.js";
import { disconnectTestDatabase, isTestDatabaseConfigured, resetTestDatabase } from "../../test/testDatabase.js";
import { PrismaAdminTrustedDeviceRepository } from "./adminTrustedDevice.repository.js";

const describeDb = isTestDatabaseConfigured() ? describe : describe.skip;

describeDb("PrismaAdminTrustedDeviceRepository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it("revokes a backup device, invalidates challenges, and records the event", async () => {
    const user = await createAdmin("device-revoke@example.com");
    const [currentDevice, backupDevice] = await Promise.all([
      createDevice(user.id, "Current device"),
      createDevice(user.id, "Backup device")
    ]);
    const challenge = await prisma.superAdminLoginChallenge.create({
      data: {
        userId: user.id,
        deviceId: backupDevice.id,
        codeAHash: "a",
        codeBHash: "b",
        codeCHash: "c",
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const revokedAt = new Date();
    const repo = new PrismaAdminTrustedDeviceRepository();

    await expect(
      repo.revoke({
        userId: user.id,
        deviceId: backupDevice.id,
        currentDeviceId: currentDevice.id,
        revokedAt
      })
    ).resolves.toMatchObject({ status: "REVOKED" });

    const [device, invalidatedChallenge, audit] = await Promise.all([
      prisma.superAdminTrustedDevice.findUnique({ where: { id: backupDevice.id } }),
      prisma.superAdminLoginChallenge.findUnique({ where: { id: challenge.id } }),
      prisma.adminAction.findFirst({
        where: {
          adminUserId: user.id,
          action: "ADMIN_TRUSTED_DEVICE_REVOKED",
          targetId: backupDevice.id
        }
      })
    ]);

    expect(device?.active).toBe(false);
    expect(invalidatedChallenge?.usedAt).toEqual(revokedAt);
    expect(audit?.metadata).toMatchObject({ label: "Backup device" });
  });

  it("serializes competing revocations so one active device always remains", async () => {
    const user = await createAdmin("device-race@example.com");
    const [deviceA, deviceB] = await Promise.all([
      createDevice(user.id, "Device A"),
      createDevice(user.id, "Device B")
    ]);
    const repo = new PrismaAdminTrustedDeviceRepository();

    const outcomes = await Promise.all([
      repo.revoke({
        userId: user.id,
        deviceId: deviceA.id,
        currentDeviceId: deviceB.id,
        revokedAt: new Date()
      }),
      repo.revoke({
        userId: user.id,
        deviceId: deviceB.id,
        currentDeviceId: deviceA.id,
        revokedAt: new Date()
      })
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "REVOKED")).toHaveLength(1);
    await expect(
      prisma.superAdminTrustedDevice.count({ where: { userId: user.id, active: true } })
    ).resolves.toBe(1);
    await expect(
      prisma.adminAction.count({
        where: { adminUserId: user.id, action: "ADMIN_TRUSTED_DEVICE_REVOKED" }
      })
    ).resolves.toBe(1);
  });
});

async function createAdmin(email: string) {
  return prisma.user.create({
    data: {
      name: "Device Test Admin",
      email,
      passwordHash: "password-hash",
      role: Role.ADMIN,
      twoStepEnabled: true,
      emailVerifiedAt: new Date()
    }
  });
}

function createDevice(userId: string, label: string) {
  return prisma.superAdminTrustedDevice.create({
    data: {
      userId,
      label,
      deviceKeyHash: `hash-${label}`
    }
  });
}
