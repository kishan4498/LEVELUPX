import { describe, expect, it } from "vitest";

import { launchTeamQuestSchema } from "./guild.validation.js";

const base = {
  title: "Weekly focus sprint",
  targetType: "FOCUS_MINUTES",
  targetValue: 300,
  rewardXp: 100,
  rewardCoins: 25,
  startDate: "2026-08-10T08:00:00.000Z",
  endDate: "2026-08-16T20:00:00.000Z"
};

describe("launchTeamQuestSchema", () => {
  it("accepts a weekly recurrence whose active window does not exceed seven days", () => {
    expect(launchTeamQuestSchema.safeParse({ ...base, repeatWeekly: true }).success).toBe(true);
  });

  it("rejects an overlapping recurrence window longer than seven days", () => {
    const parsed = launchTeamQuestSchema.safeParse({
      ...base,
      repeatWeekly: true,
      endDate: "2026-08-17T08:00:00.001Z"
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("A repeating team quest cannot span more than one week");
    }
  });
});
