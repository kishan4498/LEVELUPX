import {
  Role,
  UserStatus,
  type AdminPasskey,
  type AdminWebAuthnChallenge,
  type Prisma
} from "@prisma/client";

import { prisma } from "../../prisma/client.js";

const privilegedUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  adminWebAuthnUserId: true
} satisfies Prisma.UserSelect;

export type PrivilegedPasskeyUser = Prisma.UserGetPayload<{
  select: typeof privilegedUserSelect;
}>;

export interface IAdminPasskeyRepository {
  findPrivilegedUser(userId: string): Promise<PrivilegedPasskeyUser | null>;
  setWebAuthnUserId(userId: string, webAuthnUserId: string): Promise<PrivilegedPasskeyUser>;
  findActiveForUser(userId: string): Promise<AdminPasskey[]>;
  findActiveByCredential(userId: string, credentialId: string): Promise<AdminPasskey | null>;
  create(passkey: {
    userId: string;
    credentialId: string;
    publicKey: Buffer;
    counter: bigint;
    webAuthnUserId: string;
    deviceType: string;
    backedUp: boolean;
    transports: string[];
    label: string;
  }): Promise<AdminPasskey>;
  updateUse(id: string, counter: bigint, usedAt: Date): Promise<AdminPasskey>;
  delete(id: string, userId: string): Promise<boolean>;
  createChallenge(challenge: {
    userId: string;
    type: "REGISTRATION" | "AUTHENTICATION";
    challenge: string;
    expiresAt: Date;
  }): Promise<void>;
  consumeChallenge(challengeKey: {
    userId: string;
    type: "REGISTRATION" | "AUTHENTICATION";
    now: Date;
  }): Promise<AdminWebAuthnChallenge | null>;
}

export class PrismaAdminPasskeyRepository implements IAdminPasskeyRepository {
  findPrivilegedUser(userId: string) {
    return prisma.user.findFirst({
      where: {
        id: userId,
        role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
        status: UserStatus.ACTIVE
      },
      select: privilegedUserSelect
    });
  }

  setWebAuthnUserId(userId: string, webAuthnUserId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { adminWebAuthnUserId: webAuthnUserId },
      select: privilegedUserSelect
    });
  }

  findActiveForUser(userId: string) {
    return prisma.adminPasskey.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "asc" }
    });
  }

  findActiveByCredential(userId: string, credentialId: string) {
    return prisma.adminPasskey.findFirst({
      where: { userId, credentialId, active: true }
    });
  }

  create(passkey: {
    userId: string;
    credentialId: string;
    publicKey: Buffer;
    counter: bigint;
    webAuthnUserId: string;
    deviceType: string;
    backedUp: boolean;
    transports: string[];
    label: string;
  }) {
    return prisma.adminPasskey.create({ data: passkey });
  }

  updateUse(id: string, counter: bigint, usedAt: Date) {
    return prisma.adminPasskey.update({
      where: { id },
      data: { counter, lastUsedAt: usedAt }
    });
  }

  async delete(id: string, userId: string) {
    const deleted = await prisma.adminPasskey.deleteMany({
      where: { id, userId, active: true }
    });
    return deleted.count === 1;
  }

  async createChallenge(challenge: {
    userId: string;
    type: "REGISTRATION" | "AUTHENTICATION";
    challenge: string;
    expiresAt: Date;
  }) {
    await prisma.$transaction([
      prisma.adminWebAuthnChallenge.updateMany({
        where: { userId: challenge.userId, type: challenge.type, usedAt: null },
        data: { usedAt: new Date() }
      }),
      prisma.adminWebAuthnChallenge.create({ data: challenge })
    ]);
  }

  consumeChallenge(challengeKey: {
    userId: string;
    type: "REGISTRATION" | "AUTHENTICATION";
    now: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const challenge = await tx.adminWebAuthnChallenge.findFirst({
        where: {
          userId: challengeKey.userId,
          type: challengeKey.type,
          usedAt: null,
          expiresAt: { gt: challengeKey.now }
        },
        orderBy: { createdAt: "desc" }
      });

      if (!challenge) {
        return null;
      }

      const consumed = await tx.adminWebAuthnChallenge.updateMany({
        where: { id: challenge.id, usedAt: null },
        data: { usedAt: challengeKey.now }
      });

      return consumed.count === 1 ? challenge : null;
    });
  }
}
