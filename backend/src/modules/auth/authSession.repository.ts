import { Role, UserStatus, type Prisma, type UserSession } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

const sessionUserSelect = {
  id: true,
  role: true,
  status: true
} satisfies Prisma.UserSelect;

export type SessionWithUser = Prisma.UserSessionGetPayload<{
  include: { user: { select: typeof sessionUserSelect } };
}>;

export interface IAuthSessionRepository {
  create(session: {
    userId: string;
    tokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }): Promise<UserSession>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<SessionWithUser | null>;
  rollSessionToken(rotation: {
    id: string;
    previousTokenHash: string;
    nextTokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    now: Date;
  }): Promise<boolean>;
  revokeByTokenHash(tokenHash: string, now: Date): Promise<void>;
  revokeAllSessions(userId: string, now: Date): Promise<void>;
  revokeSession(userId: string, sessionId: string, now: Date): Promise<boolean>;
  listForUser(userId: string): Promise<UserSession[]>;
  deleteExpired(before: Date): Promise<number>;
}

export class PrismaAuthSessionRepository implements IAuthSessionRepository {
  create(session: {
    userId: string;
    tokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }) {
    return prisma.userSession.create({ data: session });
  }

  findActiveByTokenHash(tokenHash: string, now: Date) {
    return prisma.userSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
        user: {
          status: UserStatus.ACTIVE,
          role: Role.USER
        }
      },
      include: {
        user: { select: sessionUserSelect }
      }
    });
  }

  async rollSessionToken(rotation: {
    id: string;
    previousTokenHash: string;
    nextTokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    now: Date;
  }) {
    const updated = await prisma.userSession.updateMany({
      where: {
        id: rotation.id,
        tokenHash: rotation.previousTokenHash,
        revokedAt: null,
        expiresAt: { gt: rotation.now }
      },
      data: {
        tokenHash: rotation.nextTokenHash,
        userAgent: rotation.userAgent,
        ipAddress: rotation.ipAddress,
        lastUsedAt: rotation.now
      }
    });

    return updated.count === 1;
  }

  async revokeByTokenHash(tokenHash: string, now: Date) {
    await prisma.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now }
    });
  }

  async revokeAllSessions(userId: string, now: Date) {
    await prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now }
    });
  }

  async revokeSession(userId: string, sessionId: string, now: Date) {
    const updated = await prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: now }
    });

    return updated.count === 1;
  }

  listForUser(userId: string) {
    return prisma.userSession.findMany({
      where: { userId },
      orderBy: { lastUsedAt: "desc" },
      take: 20
    });
  }

  async deleteExpired(before: Date) {
    const deleted = await prisma.userSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }]
      }
    });

    return deleted.count;
  }
}
