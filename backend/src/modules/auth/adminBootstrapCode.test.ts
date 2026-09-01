import bcrypt from "bcrypt";
import { Role, UserStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { AdminBootstrapRepository, AdminBootstrapUser } from "./adminBootstrapCode.js";
import { generateAdminBootstrapCode } from "./adminBootstrapCode.js";

function makeRepo(user: AdminBootstrapUser | null) {
  const updates: { userId: string; codeHash: string; expiresAt: Date }[] = [];
  const repo: AdminBootstrapRepository = {
    async findUserByEmail() {
      return user;
    },
    async setTwoStepChallenge(challenge) {
      updates.push(challenge);
    }
  };

  return { repo, updates };
}

describe("generateAdminBootstrapCode", () => {
  it("stores a hashed expiring code for an active admin", async () => {
    const { repo, updates } = makeRepo({
      id: "admin-1",
      email: "admin@example.com",
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE
    });

    const bootstrap = await generateAdminBootstrapCode(repo, {
      email: "ADMIN@example.com",
      expiresInMinutes: 12,
      now: new Date("2026-05-26T10:00:00.000Z")
    });

    expect(bootstrap).toMatchObject({
      email: "admin@example.com",
      role: Role.SUPER_ADMIN,
      expiresAt: "2026-05-26T10:12:00.000Z",
      expiresInMinutes: 12
    });
    expect(bootstrap.code).toEqual(expect.stringMatching(/^\d{6}$/));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      userId: "admin-1",
      expiresAt: new Date("2026-05-26T10:12:00.000Z")
    });
    expect(updates[0]!.codeHash).not.toBe(bootstrap.code);
    await expect(bcrypt.compare(bootstrap.code, updates[0]!.codeHash)).resolves.toBe(true);
  });

  it("rejects non-admin users", async () => {
    const { repo } = makeRepo({
      id: "user-1",
      email: "user@example.com",
      role: Role.USER,
      status: UserStatus.ACTIVE
    });

    await expect(generateAdminBootstrapCode(repo, { email: "user@example.com" })).rejects.toThrow(
      "ADMIN_BOOTSTRAP_PRIVILEGED_ROLE_REQUIRED"
    );
  });
});
