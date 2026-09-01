import { describe, expect, it, vi } from "vitest";

import type { NotificationService } from "../../modules/notifications/notification.service.js";
import type { DailyDigestCandidate, IDailyDigestRepository } from "./dailyDigest.repository.js";
import { DailyDigestService } from "./dailyDigest.service.js";

function makeCandidate(overrides: Partial<DailyDigestCandidate> = {}): DailyDigestCandidate {
  return {
    preferenceId: "preference-1",
    userId: "user-1",
    name: "Kishan Student",
    timezone: "Asia/Kolkata",
    quietHoursStart: null,
    quietHoursEnd: null,
    lastDailyDigestAt: null,
    quests: [{ dueDate: new Date("2026-08-04T12:00:00.000Z") }, { dueDate: null }],
    focusSessions: [{ startTime: new Date("2026-08-04T02:00:00.000Z"), durationMinutes: 25 }],
    ...overrides
  };
}

describe("DailyDigestService", () => {
  it("claims and delivers one useful local-time briefing", async () => {
    const repo: IDailyDigestRepository = {
      findCandidates: vi.fn().mockResolvedValue([makeCandidate()]),
      claimDelivery: vi.fn().mockResolvedValue(true)
    };
    const notify = vi.fn().mockResolvedValue({ id: "notification-1" });
    const service = new DailyDigestService(
      repo,
      { dispatchNotification: notify } as unknown as NotificationService
    );
    const now = new Date("2026-08-04T03:00:00.000Z");

    const summary = await service.run(now);

    expect(repo.claimDelivery).toHaveBeenCalledWith("preference-1", null, now);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        title: "Good morning, Kishan",
        category: "DAILY_DIGEST",
        message: expect.stringContaining("2 active quests")
      })
    );
    expect(summary.delivered).toBe(1);
  });

  it("defers delivery during the user's quiet hours", async () => {
    const repo: IDailyDigestRepository = {
      findCandidates: vi.fn().mockResolvedValue([
        makeCandidate({ quietHoursStart: "08:00", quietHoursEnd: "09:00" })
      ]),
      claimDelivery: vi.fn().mockResolvedValue(true)
    };
    const notify = vi.fn();
    const service = new DailyDigestService(
      repo,
      { dispatchNotification: notify } as unknown as NotificationService
    );

    const summary = await service.run(new Date("2026-08-04T03:00:00.000Z"));

    expect(repo.claimDelivery).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(summary.deferredForQuietHours).toBe(1);
  });
});
