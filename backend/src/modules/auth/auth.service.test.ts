import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { CosmeticRarity, CosmeticSlot, Role, UserStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthUserRecord, IAuthRepository, SuperAdminLoginChallengeRecord, SuperAdminTrustedDeviceRecord } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";

function makeUser(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    passwordHash: overrides.passwordHash ?? "",
    role: Role.USER,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date("2026-05-25T00:00:00.000Z"),
    emailVerificationCodeHash: null,
    emailVerificationExpiresAt: null,
    emailVerificationFailedAttempts: 0,
    twoStepEnabled: false,
    twoStepCodeHash: null,
    twoStepExpiresAt: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    adminWebAuthnUserId: null,
    createdAt: new Date("2026-05-25T00:00:00.000Z"),
    updatedAt: new Date("2026-05-25T00:00:00.000Z"),
    profile: {
      id: "profile-1",
      userId: "user-1",
      avatarUrl: null,
      level: 1,
      totalXp: 0,
      coins: 0,
      currentStreak: 0,
      longestStreak: 0,
      selectedCharacterClassId: null,
      selectedCosmeticId: null,
      timezone: "UTC",
      productivityMode: "PERSONAL",
      preferredFocusMinutes: 25,
      dailyGoalMinutes: 60,
      onboardingCompletedAt: null,
      selectedCharacterClass: null,
      selectedCosmetic: null
    },
    ...overrides
  };
}

function makeTrustedDevice(overrides: Partial<SuperAdminTrustedDeviceRecord> = {}): SuperAdminTrustedDeviceRecord {
  return {
    id: "device-1",
    userId: "user-1",
    label: "owner-laptop",
    deviceKeyHash: "",
    bindingVersion: 1,
    active: true,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeRepo(user: AuthUserRecord | null, overrides: Partial<IAuthRepository> = {}): IAuthRepository {
  let storedUser = user;
  let trustedDevices: SuperAdminTrustedDeviceRecord[] = [];
  let superAdminChallenge: SuperAdminLoginChallengeRecord | null = null;

  return {
    async lookupByEmail() {
      return storedUser;
    },
    async lookupById() {
      return storedUser;
    },
    async registerNewIdentity(registration: any) {
      storedUser = makeUser({
        name: registration.name,
        email: registration.email,
        passwordHash: registration.passwordHash,
        emailVerifiedAt: null
      });
      return storedUser;
    },
    async stageEmailVerification(challenge: any) {
      storedUser = makeUser({
        ...storedUser!,
        emailVerificationCodeHash: challenge.codeHash,
        emailVerificationExpiresAt: challenge.expiresAt,
        emailVerificationFailedAttempts: 0
      });
    },
    async recordEmailVerificationFailure(attempt) {
      storedUser = makeUser({
        ...storedUser!,
        emailVerificationCodeHash: attempt.invalidate ? null : storedUser!.emailVerificationCodeHash,
        emailVerificationExpiresAt: attempt.invalidate ? null : storedUser!.emailVerificationExpiresAt,
        emailVerificationFailedAttempts: storedUser!.emailVerificationFailedAttempts + 1
      });
    },
    async finalizeEmailVerification(verification: any) {
      if (
        !storedUser ||
        storedUser.emailVerifiedAt ||
        storedUser.emailVerificationCodeHash !== verification.expectedCodeHash ||
        !storedUser.emailVerificationExpiresAt ||
        storedUser.emailVerificationExpiresAt <= verification.verifiedAt ||
        storedUser.emailVerificationFailedAttempts >= verification.maxAttempts
      ) {
        return null;
      }

      storedUser = makeUser({
        ...storedUser!,
        emailVerifiedAt: verification.verifiedAt,
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationFailedAttempts: 0,
        role: verification.activateRoot ? Role.SUPER_ADMIN : storedUser!.role,
        status: verification.activateRoot ? UserStatus.ACTIVE : storedUser!.status,
        twoStepEnabled: verification.activateRoot ? true : storedUser!.twoStepEnabled
      });
      return storedUser;
    },
    async setTwoStepEnabled(setting) {
      storedUser = makeUser({ ...storedUser!, twoStepEnabled: setting.enabled, twoStepCodeHash: null, twoStepExpiresAt: null });
      return storedUser;
    },
    async setTwoStepChallenge(challenge) {
      storedUser = makeUser({ ...storedUser!, twoStepCodeHash: challenge.codeHash, twoStepExpiresAt: challenge.expiresAt });
    },
    async clearTwoStepChallenge() {
      storedUser = makeUser({ ...storedUser!, twoStepCodeHash: null, twoStepExpiresAt: null });
    },
    async setPasswordResetToken(reset) {
      storedUser = makeUser({ ...storedUser!, passwordResetTokenHash: reset.tokenHash, passwordResetExpiresAt: reset.expiresAt });
    },
    async updatePassword(reset) {
      if (
        !storedUser ||
        storedUser.status !== UserStatus.ACTIVE ||
        storedUser.passwordResetTokenHash !== reset.expectedTokenHash ||
        !storedUser.passwordResetExpiresAt ||
        storedUser.passwordResetExpiresAt <= reset.verifiedAt
      ) {
        return null;
      }

      storedUser = makeUser({
        ...storedUser!,
        passwordHash: reset.passwordHash,
        emailVerifiedAt: reset.verifiedAt,
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationFailedAttempts: 0,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        role: reset.activateRoot ? Role.SUPER_ADMIN : storedUser!.role,
        status: reset.activateRoot ? UserStatus.ACTIVE : storedUser!.status,
        twoStepEnabled: reset.activateRoot ? true : storedUser!.twoStepEnabled
      });
      return storedUser;
    },
    async findActiveSuperAdminTrustedDevices() {
      return trustedDevices.filter((device) => device.active);
    },
    async setSuperAdminTrustedDeviceUsedAt(deviceId) {
      trustedDevices = trustedDevices.map((device) => (device.id === deviceId ? { ...device, lastUsedAt: new Date() } : device));
    },
    async clearPendingSuperAdminChallenges() {
      if (superAdminChallenge) {
        superAdminChallenge = { ...superAdminChallenge, usedAt: new Date() };
      }
    },
    async createSuperAdminLoginChallenge(challenge) {
      superAdminChallenge = {
        id: "super-admin-challenge-1",
        ...challenge,
        usedAt: null,
        createdAt: new Date()
      };
    },
    async findPendingSuperAdminLoginChallenge() {
      return superAdminChallenge?.usedAt ? null : superAdminChallenge;
    },
    async markSuperAdminLoginChallengeUsed(challengeId) {
      if (superAdminChallenge?.id === challengeId) {
        superAdminChallenge = { ...superAdminChallenge, usedAt: new Date() };
      }
    },
    ...overrides
  };
}

function makeMailer(sent: unknown[] = []) {
  return {
    async send(message: unknown) {
      sent.push(message);
      return { attempted: true, messageId: "auth-email-1" };
    }
  };
}

describe("AuthService security flows", { timeout: 15_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("withholds a session until a new account verifies its emailed code", async () => {
    const sent: Array<{ text: string }> = [];
    const repo = makeRepo(null);
    const service = new AuthService(repo, makeMailer(sent));

    const challenge = await service.register({
      name: "Ada",
      email: "ada@example.com",
      password: "registration-password"
    });
    const code = sent[0]?.text.match(/Verification code:\s*(\d{8})/)?.[1];

    expect(challenge).toMatchObject({
      emailVerificationRequired: true,
      codeLength: 8
    });
    expect(challenge).not.toHaveProperty("accessToken");
    expect(code).toEqual(expect.stringMatching(/^\d{8}$/));

    await expect(
      service.verifyEmail({
        email: "ada@example.com",
        password: "registration-password",
        code: code!
      })
    ).resolves.toMatchObject({
      accessToken: expect.any(String),
      user: {
        emailVerifiedAt: expect.any(String),
        role: Role.USER
      }
    });
  }, 15_000);

  it("activates only the configured root after password and email possession are verified", async () => {
    vi.stubEnv("ROOT_SUPER_ADMIN_EMAIL", "root@example.com");
    const passwordHash = await bcrypt.hash("root-password", 4);
    const sent: Array<{ text: string }> = [];
    const repo = makeRepo(makeUser({
      email: "root@example.com",
      passwordHash,
      emailVerifiedAt: null
    }));
    const service = new AuthService(repo, makeMailer(sent));

    await service.requestEmailVerification({ email: "root@example.com", password: "root-password" });
    const code = sent[0]?.text.match(/Verification code:\s*(\d{8})/)?.[1];
    const activation = await service.verifyEmail({
      email: "root@example.com",
      password: "root-password",
      code: code!
    });

    expect(activation).toMatchObject({
      rootActivationComplete: true,
      user: {
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        twoStepEnabled: true,
        emailVerifiedAt: expect.any(String)
      }
    });
    expect(activation).not.toHaveProperty("accessToken");
  }, 15_000);

  it("keeps the selected character class and cosmetic in session profile responses", async () => {
    const baseUser = makeUser();
    const user = makeUser({
      profile: {
        ...baseUser.profile!,
        selectedCharacterClassId: "class-scholar",
        selectedCosmeticId: "cosmetic-focus-badge",
        selectedCharacterClass: {
          id: "class-scholar",
          name: "Scholar",
          description: "Built for deliberate learning.",
          baseXpMultiplier: 1.05
        },
        selectedCosmetic: {
          id: "cosmetic-focus-badge",
          name: "Focus Badge",
          description: "Marks a focused run.",
          slot: CosmeticSlot.PROFILE_BADGE,
          rarity: CosmeticRarity.RARE,
          unlockLevel: 3
        }
      }
    });
    const service = new AuthService(makeRepo(user), makeMailer([]));

    await expect(service.getMe(user.id)).resolves.toMatchObject({
      profile: {
        selectedCharacterClass: {
          id: "class-scholar",
          name: "Scholar"
        },
        selectedCosmetic: {
          id: "cosmetic-focus-badge",
          coinPrice: 150,
          owned: true,
          selected: true
        }
      }
    });
  });

  it("issues a two-step challenge before returning a token", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const passwordHash = await bcrypt.hash("password", 4);
    const sent: unknown[] = [];
    const service = new AuthService(makeRepo(makeUser({ passwordHash, twoStepEnabled: true })), makeMailer(sent));

    const challenge = await service.login({ email: "ada@example.com", password: "password" });

    expect(challenge).toMatchObject({
      twoStepRequired: true,
      devCode: expect.stringMatching(/^\d{6}$/)
    });
    expect(sent).toEqual([
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Your LevelUpX verification code",
        text: expect.stringContaining("verification code")
      })
    ]);
  });

  it("keeps auth secrets out of non-production responses unless disclosure is explicitly enabled", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_DEV_DISCLOSE_CODES", "false");
    const passwordHash = await bcrypt.hash("password", 4);
    const sent: unknown[] = [];
    const service = new AuthService(makeRepo(makeUser({ passwordHash, twoStepEnabled: true })), makeMailer(sent));

    const challenge = await service.login({ email: "ada@example.com", password: "password" });

    expect(challenge).toMatchObject({ twoStepRequired: true });
    expect(challenge).not.toHaveProperty("devCode");
    expect(sent).toHaveLength(1);
  });

  it("issues a bootstrap challenge before an admin account with no two-step can receive an admin token", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const passwordHash = await bcrypt.hash("password", 4);
    const service = new AuthService(makeRepo(makeUser({ passwordHash, role: Role.ADMIN, twoStepEnabled: false })));

    await expect(service.login({ email: "ada@example.com", password: "password" })).resolves.toMatchObject({
      twoStepRequired: true,
      deviceKeyRequired: true,
      adminChallenge: true,
      requiredFactors: ["trustedDeviceKey"]
    });
  });

  it("prints three admin codes when auth email delivery is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_EMAIL_PRINT_CODES_TO_CONSOLE", "true");
    const passwordHash = await bcrypt.hash("password", 4);
    const deviceKey = "trusted-device-key-with-enough-length";
    const deviceKeyHash = await bcrypt.hash(deviceKey, 4);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = new AuthService(
      makeRepo(makeUser({ passwordHash, role: Role.ADMIN, twoStepEnabled: false }), {
        async findActiveSuperAdminTrustedDevices() {
          return [makeTrustedDevice({ deviceKeyHash })];
        }
      }),
      {
        async send() {
          return { attempted: false };
        }
      }
    );

    await service.login({ email: "ada@example.com", password: "password", adminDeviceKey: deviceKey });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("expiresAt="));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("codeA="));
    warn.mockRestore();
  }, 10_000);

  it("enables two-step after a successful admin device and triple-code challenge", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "test-access-secret-with-at-least-32-characters");
    vi.stubEnv("NODE_ENV", "test");
    const passwordHash = await bcrypt.hash("password", 4);
    const deviceKey = "trusted-device-key-with-enough-length";
    const deviceKeyHash = await bcrypt.hash(deviceKey, 4);
    const repo = makeRepo(makeUser({ passwordHash, role: Role.ADMIN, twoStepEnabled: false }), {
      async findActiveSuperAdminTrustedDevices() {
        return [makeTrustedDevice({ deviceKeyHash })];
      }
    });
    const service = new AuthService(repo, makeMailer());
    const deviceChallenge = await service.login({ email: "ada@example.com", password: "password" });

    expect(deviceChallenge).toMatchObject({ deviceKeyRequired: true });

    const challenge = await service.login({ email: "ada@example.com", password: "password", adminDeviceKey: deviceKey });

    if (!("devCodes" in challenge) || !challenge.devCodes) {
      throw new Error("Expected admin triple-code challenge");
    }

    const session = await service.login({
      email: "ada@example.com",
      password: "password",
      adminDeviceKey: deviceKey,
      adminCodeA: challenge.devCodes.codeA,
      adminCodeB: challenge.devCodes.codeB,
      adminCodeC: challenge.devCodes.codeC
    });

    if (!("accessToken" in session)) {
      throw new Error("Expected admin access token");
    }

    const claims = jwt.verify(session.accessToken, "test-access-secret-with-at-least-32-characters") as {
      adminVerified?: boolean;
      adminDeviceId?: string;
      adminDeviceVersion?: number;
    };

    expect(session.user.twoStepEnabled).toBe(true);
    expect(claims.adminVerified).toBe(true);
    expect(claims.adminDeviceId).toBe("device-1");
    expect(claims.adminDeviceVersion).toBe(1);
  });

  it("marks admin tokens as verified only after device and triple-code login", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "test-access-secret-with-at-least-32-characters");
    vi.stubEnv("NODE_ENV", "test");
    const passwordHash = await bcrypt.hash("password", 4);
    const deviceKey = "trusted-device-key-with-enough-length";
    const deviceKeyHash = await bcrypt.hash(deviceKey, 4);
    const repo = makeRepo(makeUser({ passwordHash, role: Role.ADMIN, twoStepEnabled: true }), {
      async findActiveSuperAdminTrustedDevices() {
        return [makeTrustedDevice({ deviceKeyHash })];
      }
    });
    const service = new AuthService(repo, makeMailer());
    const challenge = await service.login({ email: "ada@example.com", password: "password", adminDeviceKey: deviceKey });

    if (!("devCodes" in challenge) || !challenge.devCodes) {
      throw new Error("Expected admin triple-code challenge");
    }

    const session = await service.login({
      email: "ada@example.com",
      password: "password",
      adminDeviceKey: deviceKey,
      adminCodeA: challenge.devCodes.codeA,
      adminCodeB: challenge.devCodes.codeB,
      adminCodeC: challenge.devCodes.codeC
    });
    if (!("accessToken" in session)) {
      throw new Error("Expected admin access token");
    }
    const claims = jwt.verify(session.accessToken, "test-access-secret-with-at-least-32-characters") as {
      adminVerified?: boolean;
      adminDeviceId?: string;
      adminDeviceVersion?: number;
    };

    expect(claims.adminVerified).toBe(true);
    expect(claims.adminDeviceId).toBe("device-1");
    expect(claims.adminDeviceVersion).toBe(1);
  });

  it("renews a device-bound token without upgrading the passkey state", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "test-access-secret-with-at-least-32-characters");
    const repo = makeRepo(makeUser({ role: Role.ADMIN, twoStepEnabled: true }), {
      async findActiveSuperAdminTrustedDevices() {
        return [makeTrustedDevice({ bindingVersion: 7 })];
      }
    });
    const service = new AuthService(repo, makeMailer());

    const session = await service.issueDeviceBoundAdminToken("user-1", "device-1", false);
    const claims = jwt.verify(session.accessToken, "test-access-secret-with-at-least-32-characters") as {
      adminVerified?: boolean;
      passkeyVerified?: boolean;
      adminDeviceId?: string;
      adminDeviceVersion?: number;
    };

    expect(claims).toMatchObject({
      adminVerified: true,
      passkeyVerified: false,
      adminDeviceId: "device-1",
      adminDeviceVersion: 7
    });
  });

  it("asks super admin for a trusted device key after password verification", async () => {
    const passwordHash = await bcrypt.hash("password", 4);
    const service = new AuthService(makeRepo(makeUser({ passwordHash, role: Role.SUPER_ADMIN, twoStepEnabled: true })), makeMailer());

    await expect(service.login({ email: "ada@example.com", password: "password" })).resolves.toMatchObject({
      deviceKeyRequired: true,
      adminChallenge: true
    });
  });

  it("issues three admin codes after trusted device verification", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const passwordHash = await bcrypt.hash("password", 4);
    const deviceKeyHash = await bcrypt.hash("trusted-device-key-with-enough-length", 4);
    const service = new AuthService(
      makeRepo(makeUser({ passwordHash, role: Role.SUPER_ADMIN, twoStepEnabled: true }), {
        async findActiveSuperAdminTrustedDevices() {
          return [makeTrustedDevice({ deviceKeyHash })];
        }
      }),
      makeMailer()
    );

    await expect(
      service.login({
        email: "ada@example.com",
        password: "password",
        adminDeviceKey: "trusted-device-key-with-enough-length"
      })
    ).resolves.toMatchObject({
      twoStepRequired: true,
      adminChallenge: true,
      superAdminChallenge: true,
      devCodes: {
        codeA: expect.stringMatching(/^\d{6}$/),
        codeB: expect.stringMatching(/^\d{6}$/),
        codeC: expect.stringMatching(/^\d{6}$/)
      }
    });
  });

  it("requires all three admin codes before issuing an admin-verified token", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "test-access-secret-with-at-least-32-characters");
    vi.stubEnv("NODE_ENV", "test");
    const passwordHash = await bcrypt.hash("password", 4);
    const deviceKey = "trusted-device-key-with-enough-length";
    const deviceKeyHash = await bcrypt.hash(deviceKey, 4);
    let challenge: SuperAdminLoginChallengeRecord | null = null;
    let challengeUsedAt: Date | null = null;
    const service = new AuthService(
      makeRepo(makeUser({ passwordHash, role: Role.SUPER_ADMIN, twoStepEnabled: true }), {
        async findActiveSuperAdminTrustedDevices() {
          return [makeTrustedDevice({ deviceKeyHash })];
        },
        async createSuperAdminLoginChallenge(nextChallenge) {
          challenge = {
            id: "challenge-1",
            ...nextChallenge,
            usedAt: null,
            createdAt: new Date()
          };
        },
        async findPendingSuperAdminLoginChallenge() {
          return challenge;
        },
        async markSuperAdminLoginChallengeUsed() {
          challengeUsedAt = new Date();
          challenge = challenge ? { ...challenge, usedAt: challengeUsedAt } : null;
        }
      }),
      makeMailer()
    );

    const issued = await service.login({
      email: "ada@example.com",
      password: "password",
      adminDeviceKey: deviceKey
    });

    if (!("devCodes" in issued) || !issued.devCodes) {
      throw new Error("Expected super admin development codes");
    }

    const session = await service.login({
      email: "ada@example.com",
      password: "password",
      adminDeviceKey: deviceKey,
      adminCodeA: issued.devCodes.codeA,
      adminCodeB: issued.devCodes.codeB,
      adminCodeC: issued.devCodes.codeC
    });

    if (!("accessToken" in session)) {
      throw new Error("Expected super admin access token");
    }

    const claims = jwt.verify(session.accessToken, "test-access-secret-with-at-least-32-characters") as {
      adminVerified?: boolean;
      adminDeviceId?: string;
      adminDeviceVersion?: number;
    };

    expect(claims.adminVerified).toBe(true);
    expect(claims.adminDeviceId).toBe("device-1");
    expect(claims.adminDeviceVersion).toBe(1);
    expect(challengeUsedAt).toBeInstanceOf(Date);
  });

  it("resets a password with the issued token", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const passwordHash = await bcrypt.hash("old-password", 4);
    const repo = makeRepo(makeUser({ passwordHash }));
    const sent: unknown[] = [];
    const service = new AuthService(repo, makeMailer(sent));

    const reset = await service.requestPasswordReset({ email: "ada@example.com" });
    const session = await service.resetPassword({
      email: "ada@example.com",
      token: reset.devResetToken!,
      newPassword: "new-password"
    });

    if (!("accessToken" in session)) {
      throw new Error("Expected a standard user session after password reset");
    }

    expect(session.accessToken).toEqual(expect.any(String));
    expect(sent[0]).toEqual(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Reset your LevelUpX password",
        text: expect.stringContaining(reset.devResetToken!)
      })
    );
    await expect(service.login({ email: "ada@example.com", password: "new-password" })).resolves.toMatchObject({
      accessToken: expect.any(String)
    });
  });

  it("enables and disables two-step after checking the current password", async () => {
    const passwordHash = await bcrypt.hash("password", 4);
    const service = new AuthService(makeRepo(makeUser({ passwordHash })));

    await expect(service.enableTwoStep("user-1", { currentPassword: "password" })).resolves.toMatchObject({
      id: "user-1"
    });
    await expect(service.disableTwoStep("user-1", { currentPassword: "password" })).resolves.toMatchObject({
      id: "user-1"
    });
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])("does not let a %s account disable mandatory two-step", async (role) => {
    const passwordHash = await bcrypt.hash("password", 4);
    const setTwoStepEnabled = vi.fn();
    const service = new AuthService(
      makeRepo(makeUser({ passwordHash, role, twoStepEnabled: true }), { setTwoStepEnabled })
    );

    await expect(service.disableTwoStep("user-1", { currentPassword: "password" })).rejects.toMatchObject({
      code: "PRIVILEGED_TWO_STEP_REQUIRED",
      statusCode: 403
    });
    expect(setTwoStepEnabled).not.toHaveBeenCalled();
  });
});
