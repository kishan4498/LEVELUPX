import { randomBytes, randomInt } from "node:crypto";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Role, UserStatus } from "@prisma/client";

import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { cosmeticCoinPrice } from "../users/cosmeticPricing.js";
import type {
  AuthResp,
  UserDto,
  EmailChallenge,
  ForgotPwdInput,
  LoginInput,
  LoginResp,
  RegResp,
  RegisterInput,
  ReqEmailVerifyInput,
  ResetPwdResp,
  ResetPwdInput,
  RootActivated,
  TwoStepPrefInput,
  VerifyEmailInput,
  VerifyEmailResp
} from "./auth.types.js";
import type { AuthUserRecord, IAuthRepository } from "./auth.repository.js";
import { createAuthEmailSenderFromEnv, type IAuthEmailSender } from "./authEmailDelivery.js";

const SALT_ROUNDS = 12;
const TWOSTEP_TTL = 10;
const RESET_TTL = 30;
const CHALLENGE_TTL = 5;
const EMAIL_TTL = 15;
const MAX_ATTEMPTS = 5;

export class AuthService {
  constructor(
    private readonly repo: IAuthRepository,
    private readonly mailer: IAuthEmailSender = createAuthEmailSenderFromEnv()
  ) {}

  async register(registration: RegisterInput): Promise<RegResp> {
    const existing = await this.repo.lookupByEmail(registration.email);

    if (existing) {
      throw new AppError("Email is already registered", 409, "EMAIL_ALREADY_REGISTERED");
    }

    const hash = await bcrypt.hash(registration.password, SALT_ROUNDS);
    const user = await this.repo.registerNewIdentity({
      name: registration.name,
      email: registration.email,
      passwordHash: hash
    });

    return this.emailChallenge(user);
  }

  async login(credentials: LoginInput): Promise<LoginResp> {
    const user = await this.repo.lookupByEmail(credentials.email);

    if (!user) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError("This account is not active", 403, "ACCOUNT_NOT_ACTIVE");
    }

    const ok = await bcrypt.compare(credentials.password, user.passwordHash);

    if (!ok) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    if (!user.emailVerifiedAt) {
      return this.emailChallenge(user);
    }

    const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

    if (isAdmin) {
      return this.adminLogin(user, credentials);
    }

    if (user.twoStepEnabled) {
      if (!credentials.twoStepCode) {
        return this.twoStepChallenge(user);
      }

      await this.verifyTwoStep(user, credentials.twoStepCode);
    }

    return {
      user: this.toDto(user),
      accessToken: this.signAccessToken(user, { adminVerified: isAdmin })
    };
  }

  async requestPasswordReset(reset: ForgotPwdInput) {
    const user = await this.repo.lookupByEmail(reset.email);

    if (!user || user.status !== UserStatus.ACTIVE) {
      return this.pwdResetResp();
    }

    const token = randomBytes(32).toString("hex");
    const hash = await bcrypt.hash(token, SALT_ROUNDS);
    const expiresAt = addMinutes(new Date(), RESET_TTL);

    await this.repo.setPasswordResetToken({
      userId: user.id,
      tokenHash: hash,
      expiresAt
    });
    await this.mailer.send({
      to: user.email,
      subject: "Reset your LevelUpX password",
      text: [
        "Use this password reset token to set a new LevelUpX password.",
        "",
        token,
        "",
        `This token expires at ${expiresAt.toISOString()}.`
      ].join("\n")
    });

    return this.pwdResetResp(token);
  }

  async resetPassword(reset: ResetPwdInput): Promise<ResetPwdResp> {
    const user = await this.repo.lookupByEmail(reset.email);

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.passwordResetTokenHash ||
      !user.passwordResetExpiresAt
    ) {
      throw new AppError("Password reset token is invalid or expired", 400, "PASSWORD_RESET_INVALID");
    }

    if (user.passwordResetExpiresAt.getTime() <= Date.now()) {
      throw new AppError("Password reset token is invalid or expired", 400, "PASSWORD_RESET_INVALID");
    }

    const valid = await bcrypt.compare(reset.token, user.passwordResetTokenHash);

    if (!valid) {
      throw new AppError("Password reset token is invalid or expired", 400, "PASSWORD_RESET_INVALID");
    }

    const hash = await bcrypt.hash(reset.newPassword, SALT_ROUNDS);
    const activateRoot = this.needsRootActivation(user);
    const updated = await this.repo.updatePassword({
      userId: user.id,
      passwordHash: hash,
      verifiedAt: new Date(),
      expectedTokenHash: user.passwordResetTokenHash,
      activateRoot
    });

    if (!updated) {
      throw new AppError("Password reset token is invalid or expired", 400, "PASSWORD_RESET_INVALID");
    }

    if (updated.role === Role.ADMIN || updated.role === Role.SUPER_ADMIN) {
      return {
        signInRequired: true,
        message: activateRoot
          ? "Root identity verified. Register a trusted device, then sign in through the privileged login flow."
          : "Password updated. Sign in again through the privileged login flow.",
        user: this.toDto(updated)
      };
    }

    return {
      user: this.toDto(updated),
      accessToken: this.signAccessToken(updated)
    };
  }

  async requestEmailVerification(credentials: ReqEmailVerifyInput): Promise<EmailChallenge> {
    const user = await this.repo.lookupByEmail(credentials.email);

    if (!user || user.status !== UserStatus.ACTIVE || !(await bcrypt.compare(credentials.password, user.passwordHash))) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    if (user.emailVerifiedAt) {
      throw new AppError("Email is already verified", 409, "EMAIL_ALREADY_VERIFIED");
    }

    return this.emailChallenge(user);
  }

  async verifyEmail(verification: VerifyEmailInput): Promise<VerifyEmailResp> {
    const user = await this.repo.lookupByEmail(verification.email);
    const ok = user ? await bcrypt.compare(verification.password, user.passwordHash) : false;

    if (!user || user.status !== UserStatus.ACTIVE || !ok) {
      throw new AppError("Email verification code or credentials are invalid", 401, "EMAIL_VERIFICATION_INVALID");
    }

    if (user.emailVerifiedAt) {
      throw new AppError("Email is already verified", 409, "EMAIL_ALREADY_VERIFIED");
    }

    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      throw new AppError("Request a new email verification code", 400, "EMAIL_VERIFICATION_REQUIRED");
    }

    if (user.emailVerificationExpiresAt.getTime() <= Date.now()) {
      throw new AppError("Email verification code is expired", 400, "EMAIL_VERIFICATION_EXPIRED");
    }

    if (user.emailVerificationFailedAttempts >= MAX_ATTEMPTS) {
      throw new AppError("Request a new email verification code", 429, "EMAIL_VERIFICATION_LOCKED");
    }

    const hit = await bcrypt.compare(verification.code, user.emailVerificationCodeHash);

    if (!hit) {
      const attempt = user.emailVerificationFailedAttempts + 1;
      await this.repo.recordEmailVerificationFailure({
        userId: user.id,
        invalidate: attempt >= MAX_ATTEMPTS
      });

      throw new AppError(
        attempt >= MAX_ATTEMPTS
          ? "Request a new email verification code"
          : "Email verification code or credentials are invalid",
        attempt >= MAX_ATTEMPTS ? 429 : 401,
        attempt >= MAX_ATTEMPTS ? "EMAIL_VERIFICATION_LOCKED" : "EMAIL_VERIFICATION_INVALID"
      );
    }

    const activateRoot = this.needsRootActivation(user);
    const verified = await this.repo.finalizeEmailVerification({
      userId: user.id,
      verifiedAt: new Date(),
      expectedCodeHash: user.emailVerificationCodeHash,
      maxAttempts: MAX_ATTEMPTS,
      activateRoot
    });

    if (!verified) {
      throw new AppError(
        "Email verification code or credentials are invalid",
        401,
        "EMAIL_VERIFICATION_INVALID"
      );
    }

    if (activateRoot) {
      return this.rootActivated(verified);
    }

    return {
      user: this.toDto(verified),
      accessToken: this.signAccessToken(verified)
    };
  }

  async enableTwoStep(userId: string, preference: TwoStepPrefInput): Promise<UserDto> {
    const user = await this.requireUserWithPassword(userId, preference.currentPassword);
    const updated = await this.repo.setTwoStepEnabled({
      userId: user.id,
      enabled: true
    });

    return this.toDto(updated);
  }

  async disableTwoStep(userId: string, preference: TwoStepPrefInput): Promise<UserDto> {
    const user = await this.requireUserWithPassword(userId, preference.currentPassword);

    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      throw new AppError(
        "Two-step verification is mandatory for admin accounts",
        403,
        "PRIVILEGED_TWO_STEP_REQUIRED"
      );
    }

    const updated = await this.repo.setTwoStepEnabled({
      userId: user.id,
      enabled: false
    });

    return this.toDto(updated);
  }

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.repo.lookupById(userId);

    if (!user) {
      throw new AppError("Authenticated user was not found", 404, "USER_NOT_FOUND");
    }

    return this.toDto(user);
  }

  async refreshStandardUser(userId: string): Promise<AuthResp> {
    const user = await this.repo.lookupById(userId);

    if (!user || user.status !== UserStatus.ACTIVE || user.role !== Role.USER || !user.emailVerifiedAt) {
      throw new AppError("This session can no longer be refreshed", 401, "REFRESH_SESSION_INVALID");
    }

    return {
      user: this.toDto(user),
      accessToken: this.signAccessToken(user)
    };
  }

  async issueDeviceBoundAdminToken(
    userId: string,
    adminDeviceId: string,
    passkeyVerified: boolean
  ): Promise<AuthResp> {
    const user = await this.repo.lookupById(userId);

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.emailVerifiedAt ||
      !user.twoStepEnabled ||
      (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN)
    ) {
      throw new AppError("Admin account is not active", 403, "ADMIN_ACCOUNT_NOT_ACTIVE");
    }

    const devices = await this.repo.findActiveSuperAdminTrustedDevices(user.id);
    const device = devices.find((d) => d.id === adminDeviceId);

    if (!device) {
      throw new AppError("Admin session device is no longer trusted", 401, "ADMIN_DEVICE_SESSION_INVALID");
    }

    return {
      user: this.toDto(user),
      accessToken: this.signAccessToken(user, {
        adminVerified: true,
        passkeyVerified,
        adminDeviceId,
        adminDeviceVersion: device.bindingVersion
      })
    };
  }

  private signAccessToken(
    user: AuthUserRecord,
    opts: {
      adminVerified?: boolean;
      passkeyVerified?: boolean;
      adminDeviceId?: string;
      adminDeviceVersion?: number;
    } = {}
  ) {
    const isPriv = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        adminVerified: isPriv ? opts.adminVerified === true : false,
        passkeyVerified: isPriv ? opts.passkeyVerified === true : false,
        adminDeviceId: isPriv ? opts.adminDeviceId : undefined,
        adminDeviceVersion: isPriv ? opts.adminDeviceVersion : undefined,
        // Keep access tokens unique even when two logins land in the same second.
        jti: randomBytes(16).toString("hex"),
        type: "access"
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "15m" }
    );
  }

  private async requireUserWithPassword(userId: string, password: string) {
    const user = await this.repo.lookupById(userId);

    if (!user) {
      throw new AppError("Authenticated user was not found", 404, "USER_NOT_FOUND");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      throw new AppError("Invalid password", 401, "INVALID_PASSWORD");
    }

    return user;
  }

  private async emailChallenge(user: AuthUserRecord): Promise<EmailChallenge> {
    const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
    const hash = await bcrypt.hash(code, SALT_ROUNDS);
    const expiresAt = addMinutes(new Date(), EMAIL_TTL);

    await this.repo.stageEmailVerification({
      userId: user.id,
      codeHash: hash,
      expiresAt
    });

    const delivery = await this.mailer.send({
      to: user.email,
      subject: "Verify your LevelUpX email",
      text: [
        "Use this one-time code to verify ownership of your LevelUpX email address.",
        "",
        `Verification code: ${code}`,
        `Expires at: ${expiresAt.toISOString()}.`
      ].join("\n")
    });

    if (!delivery.attempted && process.env.AUTH_EMAIL_PRINT_CODES_TO_CONSOLE === "true") {
      console.warn(
        [
          "LevelUpX email verification code generated.",
          `email=${user.email}`,
          `code=${code}`,
          `expiresAt=${expiresAt.toISOString()}`
        ].join(" ")
      );
    }

    return {
      emailVerificationRequired: true,
      message: "Enter the 8-digit code sent to your email address.",
      expiresAt: expiresAt.toISOString(),
      codeLength: 8
    };
  }

  private async twoStepChallenge(user: AuthUserRecord, opts: { bootstrapAdmin?: boolean } = {}) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const hash = await bcrypt.hash(code, SALT_ROUNDS);
    const expiresAt = addMinutes(new Date(), TWOSTEP_TTL);

    await this.repo.setTwoStepChallenge({
      userId: user.id,
      codeHash: hash,
      expiresAt
    });
    const delivery = await this.mailer.send({
      to: user.email,
      subject: opts.bootstrapAdmin ? "Your LevelUpX admin bootstrap verification code" : "Your LevelUpX verification code",
      text: [
        opts.bootstrapAdmin
          ? "Use this one-time code to bootstrap two-step verification for your LevelUpX admin account."
          : `Your LevelUpX verification code is ${code}.`,
        "",
        `Code: ${code}`,
        `Expires at: ${expiresAt.toISOString()}.`
      ].join("\n")
    });

    // Never print login secrets unless development disclosure is explicitly enabled.
    if (!delivery.attempted && process.env.AUTH_EMAIL_PRINT_CODES_TO_CONSOLE === "true") {
      console.warn(
        [
          "LevelUpX admin/auth verification code generated.",
          `email=${user.email}`,
          `bootstrapAdmin=${opts.bootstrapAdmin === true}`,
          `code=${code}`,
          `expiresAt=${expiresAt.toISOString()}`
        ].join(" ")
      );
    }

    return {
      twoStepRequired: true as const,
      message: opts.bootstrapAdmin
        ? "Enter the 6-digit bootstrap verification code to enable two-step verification and finish signing in."
        : "Enter the 6-digit verification code to finish signing in.",
      expiresAt: expiresAt.toISOString(),
      ...(canExposeDevSecrets() ? { devCode: code } : {})
    };
  }

  private async adminLogin(user: AuthUserRecord, credentials: LoginInput): Promise<LoginResp> {
    if (!credentials.adminDeviceKey) {
      return this.deviceChallenge();
    }

    const device = await this.requireTrustedDevice(user, credentials.adminDeviceKey);
    const codeA = credentials.adminCodeA ?? credentials.superAdminCodeA;
    const codeB = credentials.adminCodeB ?? credentials.superAdminCodeB;
    const codeC = credentials.adminCodeC ?? credentials.superAdminCodeC;
    const hasAllCodes = Boolean(codeA && codeB && codeC);

    if (!hasAllCodes) {
      return this.adminChallenge(user, device.id);
    }

    await this.verifyAdminCodes(user, device.id, {
      codeA: codeA!,
      codeB: codeB!,
      codeC: codeC!
    });

    const loginUser = user.twoStepEnabled
      ? user
      : await this.repo.setTwoStepEnabled({
          userId: user.id,
          enabled: true
        });

    await this.repo.setSuperAdminTrustedDeviceUsedAt(device.id);

    return {
      user: this.toDto(loginUser),
      accessToken: this.signAccessToken(loginUser, {
        adminVerified: true,
        adminDeviceId: device.id,
        adminDeviceVersion: device.bindingVersion
      })
    };
  }

  private deviceChallenge() {
    return {
      twoStepRequired: true as const,
      deviceKeyRequired: true,
      adminChallenge: true,
      requiredFactors: ["trustedDeviceKey"],
      message: "Enter your trusted admin device key to continue.",
      expiresAt: addMinutes(new Date(), CHALLENGE_TTL).toISOString()
    };
  }

  private async requireTrustedDevice(user: AuthUserRecord, deviceKey: string) {
    const devices = await this.repo.findActiveSuperAdminTrustedDevices(user.id);

    for (const device of devices) {
      if (await bcrypt.compare(deviceKey, device.deviceKeyHash)) {
        return device;
      }
    }

    throw new AppError("Admin login device is not trusted", 401, "ADMIN_DEVICE_NOT_TRUSTED");
  }

  private async adminChallenge(user: AuthUserRecord, deviceId: string) {
    const codeA = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeB = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeC = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = addMinutes(new Date(), CHALLENGE_TTL);

    // Invalidate older code sets before issuing a replacement for this device.
    await this.repo.clearPendingSuperAdminChallenges({ userId: user.id, deviceId });
    await this.repo.createSuperAdminLoginChallenge({
      userId: user.id,
      deviceId,
      codeAHash: await bcrypt.hash(codeA, SALT_ROUNDS),
      codeBHash: await bcrypt.hash(codeB, SALT_ROUNDS),
      codeCHash: await bcrypt.hash(codeC, SALT_ROUNDS),
      expiresAt
    });

    const delivery = await this.mailer.send({
      to: user.email,
      subject: "Your LevelUpX admin access codes",
      text: [
        "Use all three one-time codes to finish admin login from your trusted device.",
        "",
        `Code A: ${codeA}`,
        `Code B: ${codeB}`,
        `Code C: ${codeC}`,
        `Expires at: ${expiresAt.toISOString()}.`
      ].join("\n")
    });

    if (!delivery.attempted && process.env.AUTH_EMAIL_PRINT_CODES_TO_CONSOLE === "true") {
      console.warn(
        [
          "LevelUpX admin verification codes generated.",
          `email=${user.email}`,
          `codeA=${codeA}`,
          `codeB=${codeB}`,
          `codeC=${codeC}`,
          `expiresAt=${expiresAt.toISOString()}`
        ].join(" ")
      );
    }

    return {
      twoStepRequired: true as const,
      adminChallenge: true,
      superAdminChallenge: user.role === Role.SUPER_ADMIN,
      requiredFactors: ["codeA", "codeB", "codeC"],
      message: "Enter the three admin verification codes to finish signing in from this trusted device.",
      expiresAt: expiresAt.toISOString(),
      ...(canExposeDevSecrets() ? { devCodes: { codeA, codeB, codeC } } : {})
    };
  }

  private async verifyAdminCodes(user: AuthUserRecord, deviceId: string, codes: { codeA: string; codeB: string; codeC: string }) {
    const challenge = await this.repo.findPendingSuperAdminLoginChallenge({
      userId: user.id,
      deviceId,
      now: new Date()
    });

    if (!challenge) {
      throw new AppError("Admin verification codes are invalid or expired", 401, "ADMIN_CODES_INVALID");
    }

    const [aOk, bOk, cOk] = await Promise.all([
      bcrypt.compare(codes.codeA, challenge.codeAHash),
      bcrypt.compare(codes.codeB, challenge.codeBHash),
      bcrypt.compare(codes.codeC, challenge.codeCHash)
    ]);

    if (!aOk || !bOk || !cOk) {
      throw new AppError("Admin verification codes are invalid or expired", 401, "ADMIN_CODES_INVALID");
    }

    await this.repo.markSuperAdminLoginChallengeUsed(challenge.id);
  }

  private async verifyTwoStep(user: AuthUserRecord, code: string) {
    if (!user.twoStepCodeHash || !user.twoStepExpiresAt || user.twoStepExpiresAt.getTime() <= Date.now()) {
      throw new AppError("Verification code is invalid or expired", 401, "TWO_STEP_CODE_INVALID");
    }

    const hit = await bcrypt.compare(code, user.twoStepCodeHash);

    if (!hit) {
      throw new AppError("Verification code is invalid or expired", 401, "TWO_STEP_CODE_INVALID");
    }

    await this.repo.clearTwoStepChallenge(user.id);
  }

  private pwdResetResp(token?: string) {
    return {
      message: "If the email exists, password reset instructions are available.",
      ...(token && canExposeDevSecrets() ? { devResetToken: token } : {})
    };
  }

  private needsRootActivation(user: Pick<AuthUserRecord, "email" | "emailVerifiedAt" | "role">) {
    return this.isConfiguredRoot(user) && (!user.emailVerifiedAt || user.role !== Role.SUPER_ADMIN);
  }

  private isConfiguredRoot(user: Pick<AuthUserRecord, "email">) {
    const rootEmail = process.env.ROOT_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    return Boolean(rootEmail && user.email.toLowerCase() === rootEmail);
  }

  private rootActivated(user: AuthUserRecord): RootActivated {
    return {
      rootActivationComplete: true,
      message: "Root identity verified. Register a trusted device, then sign in through the privileged login flow.",
      user: this.toDto(user)
    };
  }

  private toDto(user: AuthUserRecord): UserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      twoStepEnabled: user.twoStepEnabled,
      profile: user.profile
        ? {
            id: user.profile.id,
            avatarUrl: user.profile.avatarUrl,
            level: user.profile.level,
            totalXp: user.profile.totalXp,
            coins: user.profile.coins,
            currentStreak: user.profile.currentStreak,
            longestStreak: user.profile.longestStreak,
            timezone: user.profile.timezone,
            productivityMode: user.profile.productivityMode,
            preferredFocusMinutes: user.profile.preferredFocusMinutes,
            dailyGoalMinutes: user.profile.dailyGoalMinutes,
            onboardingCompletedAt: user.profile.onboardingCompletedAt?.toISOString() ?? null,
            selectedCharacterClass: user.profile.selectedCharacterClass
              ? {
                  id: user.profile.selectedCharacterClass.id,
                  name: user.profile.selectedCharacterClass.name,
                  description: user.profile.selectedCharacterClass.description,
                  baseXpMultiplier: user.profile.selectedCharacterClass.baseXpMultiplier
                }
              : null,
            selectedCosmetic: user.profile.selectedCosmetic
              ? {
                  id: user.profile.selectedCosmetic.id,
                  name: user.profile.selectedCosmetic.name,
                  description: user.profile.selectedCosmetic.description,
                  slot: user.profile.selectedCosmetic.slot,
                  rarity: user.profile.selectedCosmetic.rarity,
                  unlockLevel: user.profile.selectedCosmetic.unlockLevel,
                  coinPrice: cosmeticCoinPrice(user.profile.selectedCosmetic),
                  owned: true,
                  selected: true,
                  unlockedAt: null
                }
              : null
          }
        : null
    };
  }
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function canExposeDevSecrets() {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_DISCLOSE_CODES === "true";
}
