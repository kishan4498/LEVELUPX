import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../prisma/client.js";
import { disconnectTestDatabase, isTestDatabaseConfigured, resetTestDatabase } from "../../test/testDatabase.js";
import { PrismaAuthRepository } from "./auth.repository.js";

const describeDb = isTestDatabaseConfigured() ? describe : describe.skip;

describeDb("PrismaAuthRepository one-time credentials", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it("allows only one request to consume an email verification challenge", async () => {
    const repo = new PrismaAuthRepository();
    const user = await repo.registerNewIdentity({
      name: "Verification Race",
      email: "verification-race@example.com",
      passwordHash: "password-hash"
    });
    const expectedCodeHash = "verification-code-hash";
    const verifiedAt = new Date();

    await repo.stageEmailVerification({
      userId: user.id,
      codeHash: expectedCodeHash,
      expiresAt: new Date(verifiedAt.getTime() + 60_000)
    });

    const attempts = await Promise.all([
      repo.finalizeEmailVerification({
        userId: user.id,
        verifiedAt,
        expectedCodeHash,
        maxAttempts: 5,
        activateRoot: true
      }),
      repo.finalizeEmailVerification({
        userId: user.id,
        verifiedAt,
        expectedCodeHash,
        maxAttempts: 5,
        activateRoot: true
      })
    ]);

    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(attempts.find(Boolean)).toMatchObject({ role: Role.SUPER_ADMIN });
    await expect(
      prisma.adminAction.count({
        where: { adminUserId: user.id, action: "ROOT_IDENTITY_ACTIVATED" }
      })
    ).resolves.toBe(1);
  });

  it("allows only one request to consume a password-reset token", async () => {
    const repo = new PrismaAuthRepository();
    const user = await repo.registerNewIdentity({
      name: "Reset Race",
      email: "reset-race@example.com",
      passwordHash: "old-password-hash"
    });
    const expectedTokenHash = "password-reset-token-hash";
    const verifiedAt = new Date();

    await repo.setPasswordResetToken({
      userId: user.id,
      tokenHash: expectedTokenHash,
      expiresAt: new Date(verifiedAt.getTime() + 60_000)
    });

    const attempts = await Promise.all([
      repo.updatePassword({
        userId: user.id,
        passwordHash: "new-password-hash-a",
        verifiedAt,
        expectedTokenHash,
        activateRoot: true
      }),
      repo.updatePassword({
        userId: user.id,
        passwordHash: "new-password-hash-b",
        verifiedAt,
        expectedTokenHash,
        activateRoot: true
      })
    ]);

    expect(attempts.filter(Boolean)).toHaveLength(1);
    await expect(
      prisma.adminAction.count({
        where: { adminUserId: user.id, action: "ROOT_IDENTITY_ACTIVATED" }
      })
    ).resolves.toBe(1);
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])("rejects a %s database row without two-step enabled", async (role) => {
    const repo = new PrismaAuthRepository();
    const user = await repo.registerNewIdentity({
      name: "Privileged Invariant",
      email: `${role.toLowerCase()}-invariant@example.com`,
      passwordHash: "password-hash"
    });

    await expect(
      prisma.user.update({
        where: { id: user.id },
        data: { role, twoStepEnabled: false }
      })
    ).rejects.toThrow();

    await expect(prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })).resolves.toEqual({
      role: Role.USER
    });
  });
});
