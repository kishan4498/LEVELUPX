import { SessionType, type FocusSession } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { realtimeEvents, type RealtimeEvent } from "../../realtime/realtime.types.js";
import type { IFocusSessionRepository } from "./focusSession.repository.js";
import { FocusSessionService } from "./focusSession.service.js";

function session(patch: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "session-1",
    userId: "user-1",
    questId: null,
    startTime: new Date("2026-08-12T09:00:00.000Z"),
    endTime: null,
    durationMinutes: null,
    sessionType: SessionType.POMODORO,
    completed: false,
    targetMinutes: 25,
    goal: "Read one chapter",
    pausedAt: null,
    pausedSeconds: 0,
    distractionNote: null,
    ...patch
  };
}

function statefulRepo(): IFocusSessionRepository {
  let current = session();

  return {
    create: vi.fn(async () => current),
    findById: vi.fn(async () => current),
    findActiveForUser: vi.fn().mockResolvedValue(null),
    findQuestById: vi.fn().mockResolvedValue(null),
    stop: vi.fn(async (update) => {
      current = session({
        ...current,
        endTime: update.endTime,
        durationMinutes: update.durationMinutes,
        completed: update.completed,
        pausedAt: null,
        distractionNote: update.distractionNote ?? null
      });
      return current;
    }),
    pause: vi.fn(async (_id, pausedAt) => {
      current = session({ ...current, pausedAt });
      return current;
    }),
    resume: vi.fn(async (_id, pausedSeconds) => {
      current = session({ ...current, pausedAt: null, pausedSeconds });
      return current;
    }),
    updateNote: vi.fn(async (_id, distractionNote) => {
      current = session({ ...current, distractionNote });
      return current;
    }),
    findHistory: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue([])
  };
}

describe("FocusSessionService realtime presence", () => {
  it("publishes start, pause, resume, and stop only to self and accepted accountability peers", async () => {
    const events: RealtimeEvent[] = [];
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-12T09:00:01.000Z"))
      .mockReturnValueOnce(new Date("2026-08-12T09:05:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-12T09:05:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-12T09:06:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-12T09:06:00.000Z"))
      .mockReturnValue(new Date("2026-08-12T09:25:00.000Z"));
    const service = new FocusSessionService(
      statefulRepo(),
      { findAcceptedPeerIds: vi.fn().mockResolvedValue(["accepted-1", "accepted-2"]) },
      (event) => {
        events.push(event);
        return true;
      },
      now
    );

    await service.start("user-1", { sessionType: SessionType.POMODORO, targetMinutes: 25 });
    await service.pause("user-1", "session-1");
    await service.resume("user-1", "session-1");
    await service.stop("user-1", "session-1", { completed: true });

    const presence = events.filter((event) => event.name === realtimeEvents.focusPresenceChanged);
    expect(presence).toHaveLength(4);
    expect(presence.map((event) => event.payload.state)).toEqual(["FOCUSING", "PAUSED", "FOCUSING", "IDLE"]);
    for (const event of presence) {
      expect("userIds" in event ? event.userIds : []).toEqual(["user-1", "accepted-1", "accepted-2"]);
      expect("userIds" in event ? event.userIds : []).not.toContain("pending-or-blocked-user");
    }
  });

  it("does not fail a focus transition when the supplemental audience lookup is unavailable", async () => {
    const service = new FocusSessionService(
      statefulRepo(),
      { findAcceptedPeerIds: vi.fn().mockRejectedValue(new Error("lookup failed")) },
      vi.fn().mockReturnValue(true)
    );

    await expect(
      service.start("user-1", { sessionType: SessionType.POMODORO, targetMinutes: 25 })
    ).resolves.toMatchObject({ id: "session-1" });
  });
});
