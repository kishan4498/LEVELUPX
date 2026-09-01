import type { FocusSession, Prisma, Quest } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type CreateFocusSessionData = {
  userId: string;
  questId?: string;
  sessionType: FocusSession["sessionType"];
  targetMinutes?: number;
  goal?: string;
};

export type FocusSessionHistoryFilters = {
  userId: string;
  skip: number;
  take: number;
  from?: Date;
  to?: Date;
};

export interface IFocusSessionRepository {
  create(session: CreateFocusSessionData): Promise<FocusSession>;
  findById(id: string): Promise<FocusSession | null>;
  findActiveForUser(userId: string): Promise<FocusSession | null>;
  findQuestById(id: string): Promise<Quest | null>;
  stop(update: {
    id: string;
    endTime: Date;
    durationMinutes: number;
    completed: boolean;
    distractionNote?: string;
  }): Promise<FocusSession>;
  pause(id: string, pausedAt: Date): Promise<FocusSession>;
  resume(id: string, pausedSeconds: number): Promise<FocusSession>;
  updateNote(id: string, distractionNote: string): Promise<FocusSession>;
  findHistory(filters: FocusSessionHistoryFilters): Promise<FocusSession[]>;
  getStats(userId: string): Promise<FocusSession[]>;
}

export class PrismaFocusSessionRepository implements IFocusSessionRepository {
  create(session: CreateFocusSessionData) {
    return prisma.focusSession.create({
      data: {
        userId: session.userId,
        questId: session.questId,
        sessionType: session.sessionType,
        targetMinutes: session.targetMinutes,
        goal: session.goal,
        startTime: new Date()
      }
    });
  }

  findById(id: string) {
    return prisma.focusSession.findUnique({
      where: { id }
    });
  }

  findActiveForUser(userId: string) {
    return prisma.focusSession.findFirst({
      where: {
        userId,
        endTime: null
      },
      orderBy: {
        startTime: "desc"
      }
    });
  }

  findQuestById(id: string) {
    return prisma.quest.findUnique({
      where: { id }
    });
  }

  stop(update: { id: string; endTime: Date; durationMinutes: number; completed: boolean; distractionNote?: string }) {
    return prisma.focusSession.update({
      where: { id: update.id },
      data: {
        endTime: update.endTime,
        durationMinutes: update.durationMinutes,
        completed: update.completed,
        pausedAt: null,
        distractionNote: update.distractionNote
      }
    });
  }

  pause(id: string, pausedAt: Date) {
    return prisma.focusSession.update({
      where: { id },
      data: { pausedAt }
    });
  }

  resume(id: string, pausedSeconds: number) {
    return prisma.focusSession.update({
      where: { id },
      data: {
        pausedAt: null,
        pausedSeconds
      }
    });
  }

  updateNote(id: string, distractionNote: string) {
    return prisma.focusSession.update({
      where: { id },
      data: { distractionNote }
    });
  }

  findHistory(filters: FocusSessionHistoryFilters) {
    const where = {
      userId: filters.userId,
      ...(filters.from || filters.to
        ? {
            startTime: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {})
            }
          }
        : {})
    } satisfies Prisma.FocusSessionWhereInput;

    return prisma.focusSession.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip: filters.skip,
      take: filters.take
    });
  }

  getStats(userId: string) {
    return prisma.focusSession.findMany({
      where: {
        userId,
        durationMinutes: {
          not: null
        }
      }
    });
  }
}
