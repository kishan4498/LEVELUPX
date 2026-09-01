import { ConnectionStatus, UserStatus, type Prisma } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

const accountabilityInclude = {
  requester: { select: { id: true, name: true } },
  recipient: { select: { id: true, name: true } }
} satisfies Prisma.AccountabilityConnectionInclude;

export type AccountabilityConnectionWithPeople = Prisma.AccountabilityConnectionGetPayload<{
  include: typeof accountabilityInclude;
}>;

export type AccountabilityProgress = {
  completedQuestsLast7Days: number;
  focusMinutesLast7Days: number;
  currentStreak: number;
  focusPresence: {
    sessionId: string;
    state: "FOCUSING" | "PAUSED";
    sessionType: string;
    targetMinutes: number | null;
    startedAt: string;
    updatedAt: string;
  } | null;
};

export interface IAccountabilityRepository {
  findActiveUserByEmail(email: string): Promise<{ id: string; name: string } | null>;
  findBetween(userId: string, otherUserId: string): Promise<AccountabilityConnectionWithPeople | null>;
  findForUser(userId: string): Promise<AccountabilityConnectionWithPeople[]>;
  findById(id: string): Promise<AccountabilityConnectionWithPeople | null>;
  create(requesterId: string, recipientId: string): Promise<AccountabilityConnectionWithPeople>;
  updateStatus(
    id: string,
    status: ConnectionStatus,
    blockedByUserId?: string | null
  ): Promise<AccountabilityConnectionWithPeople>;
  delete(id: string): Promise<void>;
  getProgress(userId: string, since: Date): Promise<AccountabilityProgress>;
  findAcceptedPeerIds(userId: string): Promise<string[]>;
}

export class PrismaAccountabilityRepository implements IAccountabilityRepository {
  findActiveUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: {
        email,
        status: UserStatus.ACTIVE
      },
      select: { id: true, name: true }
    });
  }

  findBetween(userId: string, otherUserId: string) {
    return prisma.accountabilityConnection.findFirst({
      where: {
        OR: [
          { requesterId: userId, recipientId: otherUserId },
          { requesterId: otherUserId, recipientId: userId }
        ]
      },
      include: accountabilityInclude
    });
  }

  findForUser(userId: string) {
    return prisma.accountabilityConnection.findMany({
      where: {
        OR: [{ requesterId: userId }, { recipientId: userId }]
      },
      include: accountabilityInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
  }

  findById(id: string) {
    return prisma.accountabilityConnection.findUnique({
      where: { id },
      include: accountabilityInclude
    });
  }

  create(requesterId: string, recipientId: string) {
    return prisma.accountabilityConnection.create({
      data: { requesterId, recipientId },
      include: accountabilityInclude
    });
  }

  updateStatus(id: string, status: ConnectionStatus, blockedByUserId?: string | null) {
    return prisma.accountabilityConnection.update({
      where: { id },
      data: {
        status,
        blockedByUserId: status === ConnectionStatus.BLOCKED ? blockedByUserId : null
      },
      include: accountabilityInclude
    });
  }

  async delete(id: string) {
    await prisma.accountabilityConnection.delete({ where: { id } });
  }

  async getProgress(userId: string, since: Date): Promise<AccountabilityProgress> {
    const [completed, focus, profile, activeFocusSession] = await Promise.all([
      prisma.questCompletion.count({
        where: { userId, completedAt: { gte: since } }
      }),
      prisma.focusSession.aggregate({
        where: {
          userId,
          completed: true,
          startTime: { gte: since }
        },
        _sum: { durationMinutes: true }
      }),
      prisma.userProfile.findUnique({
        where: { userId },
        select: { currentStreak: true }
      }),
      prisma.focusSession.findFirst({
        where: { userId, endTime: null },
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          sessionType: true,
          targetMinutes: true,
          startTime: true,
          pausedAt: true
        }
      })
    ]);

    return {
      completedQuestsLast7Days: completed,
      focusMinutesLast7Days: focus._sum.durationMinutes ?? 0,
      currentStreak: profile?.currentStreak ?? 0,
      focusPresence: activeFocusSession
        ? {
            sessionId: activeFocusSession.id,
            state: activeFocusSession.pausedAt ? "PAUSED" : "FOCUSING",
            sessionType: activeFocusSession.sessionType,
            targetMinutes: activeFocusSession.targetMinutes,
            startedAt: activeFocusSession.startTime.toISOString(),
            updatedAt: (activeFocusSession.pausedAt ?? activeFocusSession.startTime).toISOString()
          }
        : null
    };
  }

  async findAcceptedPeerIds(userId: string) {
    const connections = await prisma.accountabilityConnection.findMany({
      where: {
        status: ConnectionStatus.ACCEPTED,
        OR: [{ requesterId: userId }, { recipientId: userId }]
      },
      select: { requesterId: true, recipientId: true }
    });

    return connections.map((connection) =>
      connection.requesterId === userId ? connection.recipientId : connection.requesterId
    );
  }
}
