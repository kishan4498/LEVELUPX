import { Role, UserStatus, type Prisma, type SuperAdminLoginChallenge, type SuperAdminTrustedDevice, type User } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { prisma } from "../../prisma/client.js";

const authUserInclude = {
  profile: {
    include: {
      selectedCharacterClass: true,
      selectedCosmetic: true
    }
  }
} satisfies Prisma.UserInclude;

export type AuthUserRecord = Prisma.UserGetPayload<{
  include: typeof authUserInclude;
}>;

export type SuperAdminTrustedDeviceRecord = SuperAdminTrustedDevice;
export type SuperAdminLoginChallengeRecord = SuperAdminLoginChallenge;

export interface IAuthRepository {
  lookupByEmail(email: string): Promise<AuthUserRecord | null>;
  lookupById(id: string): Promise<AuthUserRecord | null>;
  registerNewIdentity(registration: { name: string; email: string; passwordHash: string }): Promise<AuthUserRecord>;
  stageEmailVerification(challenge: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>;
  recordEmailVerificationFailure(attempt: { userId: string; invalidate: boolean }): Promise<void>;
  finalizeEmailVerification(verification: {
    userId: string;
    verifiedAt: Date;
    expectedCodeHash: string;
    maxAttempts: number;
    activateRoot: boolean;
  }): Promise<AuthUserRecord | null>;
  setTwoStepEnabled(setting: { userId: string; enabled: boolean }): Promise<AuthUserRecord>;
  setTwoStepChallenge(challenge: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>;
  clearTwoStepChallenge(userId: string): Promise<void>;
  setPasswordResetToken(reset: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  updatePassword(reset: {
    userId: string;
    passwordHash: string;
    verifiedAt: Date;
    expectedTokenHash: string;
    activateRoot: boolean;
  }): Promise<AuthUserRecord | null>;
  findActiveSuperAdminTrustedDevices(userId: string): Promise<SuperAdminTrustedDeviceRecord[]>;
  setSuperAdminTrustedDeviceUsedAt(deviceId: string): Promise<void>;
  clearPendingSuperAdminChallenges(device: { userId: string; deviceId: string }): Promise<void>;
  createSuperAdminLoginChallenge(challenge: {
    userId: string;
    deviceId: string;
    codeAHash: string;
    codeBHash: string;
    codeCHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findPendingSuperAdminLoginChallenge(lookup: { userId: string; deviceId: string; now: Date }): Promise<SuperAdminLoginChallengeRecord | null>;
  markSuperAdminLoginChallengeUsed(challengeId: string): Promise<void>;
}

export class PrismaAuthRepository implements IAuthRepository {
  lookupByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: authUserInclude
    });
  }

  lookupById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: authUserInclude
    });
  }

  async registerNewIdentity(registration: { name: string; email: string; passwordHash: string }) {
    return prisma.$transaction(async (tx) => {
      const user: User = await tx.user.create({
        data: {
          name: registration.name,
          email: registration.email,
          passwordHash: registration.passwordHash
        }
      });

      await tx.userProfile.create({
        data: {
          userId: user.id
        }
      });

      const created = await tx.user.findUnique({
        where: { id: user.id },
        include: authUserInclude
      });

      if (!created) {
        throw new AppError("Registered user could not be loaded", 500, "USER_LOAD_FAILED");
      }

      return created;
    });
  }

  async stageEmailVerification(challenge: { userId: string; codeHash: string; expiresAt: Date }) {
    await prisma.user.update({
      where: { id: challenge.userId },
      data: {
        emailVerificationCodeHash: challenge.codeHash,
        emailVerificationExpiresAt: challenge.expiresAt,
        emailVerificationFailedAttempts: 0
      }
    });
  }

  async recordEmailVerificationFailure(attempt: { userId: string; invalidate: boolean }) {
    await prisma.user.update({
      where: { id: attempt.userId },
      data: {
        emailVerificationFailedAttempts: { increment: 1 },
        ...(attempt.invalidate
          ? {
              emailVerificationCodeHash: null,
              emailVerificationExpiresAt: null
            }
          : {})
      }
    });
  }

  finalizeEmailVerification(verification: {
    userId: string;
    verifiedAt: Date;
    expectedCodeHash: string;
    maxAttempts: number;
    activateRoot: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      // The guarded update lets only one request consume the challenge.
      const consumed = await tx.user.updateMany({
        where: {
          id: verification.userId,
          emailVerifiedAt: null,
          emailVerificationCodeHash: verification.expectedCodeHash,
          emailVerificationExpiresAt: { gt: verification.verifiedAt },
          emailVerificationFailedAttempts: { lt: verification.maxAttempts }
        },
        data: {
          emailVerifiedAt: verification.verifiedAt,
          emailVerificationCodeHash: null,
          emailVerificationExpiresAt: null,
          emailVerificationFailedAttempts: 0,
          ...(verification.activateRoot
            ? {
                role: Role.SUPER_ADMIN,
                status: UserStatus.ACTIVE,
                twoStepEnabled: true,
                twoStepCodeHash: null,
                twoStepExpiresAt: null,
                passwordResetTokenHash: null,
                passwordResetExpiresAt: null
              }
            : {})
        }
      });

      if (consumed.count !== 1) {
        return null;
      }

      const user = await tx.user.findUnique({
        where: { id: verification.userId },
        include: authUserInclude
      });

      if (!user) {
        throw new AppError("Verified user could not be loaded", 500, "USER_LOAD_FAILED");
      }

      if (verification.activateRoot) {
        await tx.adminAction.create({
          data: {
            adminUserId: user.id,
            action: "ROOT_IDENTITY_ACTIVATED",
            targetType: "USER",
            targetId: user.id,
            metadata: {
              method: "EMAIL_POSSESSION_VERIFICATION"
            }
          }
        });
      }

      return user;
    });
  }

  async setTwoStepEnabled(setting: { userId: string; enabled: boolean }) {
    if (!setting.enabled) {
      // Keep the role guard in the write so a concurrent promotion cannot slip through.
      const disabled = await prisma.user.updateMany({
        where: {
          id: setting.userId,
          role: Role.USER
        },
        data: {
          twoStepEnabled: false,
          twoStepCodeHash: null,
          twoStepExpiresAt: null
        }
      });

      if (disabled.count !== 1) {
        throw new AppError(
          "Two-step verification is mandatory for admin accounts",
          403,
          "PRIVILEGED_TWO_STEP_REQUIRED"
        );
      }

      const user = await this.lookupById(setting.userId);

      if (!user) {
        throw new AppError("Updated two-step user could not be loaded", 500, "USER_LOAD_FAILED");
      }

      return user;
    }

    return prisma.user.update({
      where: { id: setting.userId },
      data: {
        twoStepEnabled: true,
        twoStepCodeHash: null,
        twoStepExpiresAt: null
      },
      include: authUserInclude
    });
  }

  async setTwoStepChallenge(challenge: { userId: string; codeHash: string; expiresAt: Date }) {
    await prisma.user.update({
      where: { id: challenge.userId },
      data: {
        twoStepCodeHash: challenge.codeHash,
        twoStepExpiresAt: challenge.expiresAt
      }
    });
  }

  async clearTwoStepChallenge(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoStepCodeHash: null,
        twoStepExpiresAt: null
      }
    });
  }

  async setPasswordResetToken(reset: { userId: string; tokenHash: string; expiresAt: Date }) {
    await prisma.user.update({
      where: { id: reset.userId },
      data: {
        passwordResetTokenHash: reset.tokenHash,
        passwordResetExpiresAt: reset.expiresAt
      }
    });
  }

  updatePassword(reset: {
    userId: string;
    passwordHash: string;
    verifiedAt: Date;
    expectedTokenHash: string;
    activateRoot: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      // Consume the token hash in the write to close the compare-and-cleanup race.
      const consumed = await tx.user.updateMany({
        where: {
          id: reset.userId,
          status: UserStatus.ACTIVE,
          passwordResetTokenHash: reset.expectedTokenHash,
          passwordResetExpiresAt: { gt: reset.verifiedAt }
        },
        data: {
          passwordHash: reset.passwordHash,
          emailVerifiedAt: reset.verifiedAt,
          emailVerificationCodeHash: null,
          emailVerificationExpiresAt: null,
          emailVerificationFailedAttempts: 0,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          twoStepCodeHash: null,
          twoStepExpiresAt: null,
          ...(reset.activateRoot
            ? {
                role: Role.SUPER_ADMIN,
                status: UserStatus.ACTIVE,
                twoStepEnabled: true
              }
            : {})
        }
      });

      if (consumed.count !== 1) {
        return null;
      }

      const user = await tx.user.findUnique({
        where: { id: reset.userId },
        include: authUserInclude
      });

      if (!user) {
        throw new AppError("Password-reset user could not be loaded", 500, "USER_LOAD_FAILED");
      }

      if (reset.activateRoot) {
        await tx.adminAction.create({
          data: {
            adminUserId: user.id,
            action: "ROOT_IDENTITY_ACTIVATED",
            targetType: "USER",
            targetId: user.id,
            metadata: {
              method: "PASSWORD_RESET_EMAIL_TOKEN"
            }
          }
        });
      }

      return user;
    });
  }

  findActiveSuperAdminTrustedDevices(userId: string) {
    return prisma.superAdminTrustedDevice.findMany({
      where: {
        userId,
        active: true
      }
    });
  }

  async setSuperAdminTrustedDeviceUsedAt(deviceId: string) {
    await prisma.superAdminTrustedDevice.update({
      where: { id: deviceId },
      data: {
        lastUsedAt: new Date()
      }
    });
  }

  async clearPendingSuperAdminChallenges(device: { userId: string; deviceId: string }) {
    await prisma.superAdminLoginChallenge.updateMany({
      where: {
        userId: device.userId,
        deviceId: device.deviceId,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
    });
  }

  async createSuperAdminLoginChallenge(challenge: {
    userId: string;
    deviceId: string;
    codeAHash: string;
    codeBHash: string;
    codeCHash: string;
    expiresAt: Date;
  }) {
    await prisma.superAdminLoginChallenge.create({
      data: challenge
    });
  }

  findPendingSuperAdminLoginChallenge(lookup: { userId: string; deviceId: string; now: Date }) {
    return prisma.superAdminLoginChallenge.findFirst({
      where: {
        userId: lookup.userId,
        deviceId: lookup.deviceId,
        device: {
          active: true
        },
        usedAt: null,
        expiresAt: {
          gt: lookup.now
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async markSuperAdminLoginChallengeUsed(challengeId: string) {
    await prisma.superAdminLoginChallenge.update({
      where: { id: challengeId },
      data: {
        usedAt: new Date()
      }
    });
  }
}
