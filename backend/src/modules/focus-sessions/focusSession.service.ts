import type { FocusSession } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { writeLog } from "../../common/logger/logger.js";
import { publishRealtimeEvent } from "../../realtime/realtime.publisher.js";
import { realtimeEvents, type RealtimeEvent } from "../../realtime/realtime.types.js";
import type {
  HistoryInput,
  SessionDto,
  SessionStats,
  StartSessionInput,
  StopSessionInput,
  NoteInput
} from "./focusSession.types.js";
import type { IFocusSessionRepository } from "./focusSession.repository.js";

export class FocusSessionService {
  constructor(
    private readonly repo: IFocusSessionRepository,
    private readonly presenceAudience: FocusPresenceAudience = { findAcceptedPeerIds: async () => [] },
    private readonly publish: (event: RealtimeEvent) => boolean = publishRealtimeEvent,
    private readonly now: () => Date = () => new Date()
  ) {}

  async start(userId: string, request: StartSessionInput): Promise<SessionDto> {
    const active = await this.repo.findActiveForUser(userId);

    if (active) {
      // Overlapping sessions would inflate rewards, analytics, and leaderboard totals.
      throw new AppError("Stop your active focus session before starting a new one", 409, "ACTIVE_SESSION_EXISTS");
    }

    if (request.questId) {
      const quest = await this.repo.findQuestById(request.questId);

      // Keep quest details private and prevent users from crediting someone else's quest.
      if (!quest || quest.userId !== userId) {
        throw new AppError("Quest not found", 404, "QUEST_NOT_FOUND");
      }
    }

    const session = await this.repo.create({
      userId,
      questId: request.questId,
      sessionType: request.sessionType,
      targetMinutes: request.targetMinutes,
      goal: request.goal
    });

    publishRealtimeEvent({
      name: realtimeEvents.focusSessionStarted,
      userId,
      payload: {
        sessionId: session.id,
        questId: session.questId
      }
    });
    await this.publishPresence(userId, session, "FOCUSING");

    return this.toDto(session);
  }

  async stop(userId: string, id: string, request: StopSessionInput): Promise<SessionDto> {
    const session = await this.repo.findById(id);

    if (!session || session.userId !== userId) {
      throw new AppError("Focus session not found", 404, "FOCUS_SESSION_NOT_FOUND");
    }

    if (session.endTime) {
      throw new AppError("Focus session is already stopped", 409, "FOCUS_SESSION_ALREADY_STOPPED");
    }

    const endedAt = this.now();
    // Keep valid short sessions visible while storing readable whole-minute stats.
    const pauseSecs = session.pausedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - session.pausedAt.getTime()) / 1000))
      : 0;
    const elapsedSecs = Math.max(
      60,
      Math.floor((endedAt.getTime() - session.startTime.getTime()) / 1000) - session.pausedSeconds - pauseSecs
    );
    const minutes = Math.max(1, Math.round(elapsedSecs / 60));
    const completed = request.completed ?? true;

    const stopped = await this.repo.stop({
      id: session.id,
      endTime: endedAt,
      durationMinutes: minutes,
      completed,
      distractionNote: request.distractionNote
    });

    publishRealtimeEvent({
      name: realtimeEvents.focusSessionStopped,
      userId,
      payload: {
        sessionId: stopped.id,
        questId: stopped.questId,
        completed: stopped.completed,
        durationMinutes: stopped.durationMinutes
      }
    });
    await this.publishPresence(userId, stopped, "IDLE");

    return this.toDto(stopped);
  }

  async pause(userId: string, id: string): Promise<SessionDto> {
    const session = await this.getActive(userId, id);

    if (session.pausedAt) {
      throw new AppError("Focus session is already paused", 409, "FOCUS_SESSION_ALREADY_PAUSED");
    }

    const paused = await this.repo.pause(session.id, this.now());
    await this.publishPresence(userId, paused, "PAUSED");
    return this.toDto(paused);
  }

  async resume(userId: string, id: string): Promise<SessionDto> {
    const session = await this.getActive(userId, id);

    if (!session.pausedAt) {
      throw new AppError("Focus session is not paused", 409, "FOCUS_SESSION_NOT_PAUSED");
    }

    const pauseSeconds = Math.max(0, Math.floor((this.now().getTime() - session.pausedAt.getTime()) / 1000));
    const resumed = await this.repo.resume(session.id, session.pausedSeconds + pauseSeconds);
    await this.publishPresence(userId, resumed, "FOCUSING");
    return this.toDto(resumed);
  }

  async updateNote(userId: string, id: string, note: NoteInput): Promise<SessionDto> {
    const session = await this.getActive(userId, id);
    return this.toDto(await this.repo.updateNote(session.id, note.distractionNote));
  }

  async history(userId: string, query: HistoryInput): Promise<SessionDto[]> {
    const sessions = await this.repo.findHistory({
      userId,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined
    });

    return sessions.map((session) => this.toDto(session));
  }

  async stats(userId: string): Promise<SessionStats> {
    const sessions = await this.repo.getStats(userId);
    const done = sessions.filter((s) => s.completed).length;
    const total = sessions.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);

    return {
      totalSessions: sessions.length,
      completedSessions: done,
      totalFocusMinutes: total,
      averageSessionMinutes: sessions.length > 0 ? Math.round(total / sessions.length) : 0
    };
  }

  private toDto(session: FocusSession): SessionDto {
    return {
      id: session.id,
      questId: session.questId,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime?.toISOString() ?? null,
      durationMinutes: session.durationMinutes,
      sessionType: session.sessionType,
      completed: session.completed,
      targetMinutes: session.targetMinutes,
      goal: session.goal,
      pausedAt: session.pausedAt?.toISOString() ?? null,
      pausedSeconds: session.pausedSeconds,
      distractionNote: session.distractionNote
    };
  }

  private async getActive(userId: string, id: string) {
    const session = await this.repo.findById(id);

    if (!session || session.userId !== userId) {
      throw new AppError("Focus session not found", 404, "FOCUS_SESSION_NOT_FOUND");
    }

    if (session.endTime) {
      throw new AppError("Focus session is already stopped", 409, "FOCUS_SESSION_ALREADY_STOPPED");
    }

    return session;
  }

  private async publishPresence(
    userId: string,
    session: FocusSession,
    state: "FOCUSING" | "PAUSED" | "IDLE"
  ) {
    try {
      const acceptedPeerIds = await this.presenceAudience.findAcceptedPeerIds(userId);
      const updatedAt = this.now().toISOString();

      this.publish({
        name: realtimeEvents.focusPresenceChanged,
        userIds: [userId, ...acceptedPeerIds],
        payload: {
          userId,
          sessionId: session.id,
          state,
          sessionType: session.sessionType,
          targetMinutes: session.targetMinutes,
          startedAt: session.startTime.toISOString(),
          updatedAt
        }
      });
    } catch (error) {
      // Presence is supplemental; a transient realtime lookup must not roll back focus state.
      writeLog({
        level: "warn",
        message: "Focus presence publication failed",
        userId,
        error: error instanceof Error ? error.message : "Unknown presence error"
      });
    }
  }
}

export type FocusPresenceAudience = {
  findAcceptedPeerIds(userId: string): Promise<string[]>;
};
