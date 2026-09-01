import { describe, expect, it } from "vitest";

import type { Guild, TeamQuest } from "@/types/guild";

import {
  findBoardScope,
  guildMedalClass,
  keepSelectedGuild,
  mergeQuestProgress
} from "./guilds.model";

const guild = (id: string): Guild => ({
  id,
  name: `Guild ${id}`,
  description: null,
  ownerId: "owner-1",
  totalXp: 0,
  visibility: "PUBLIC",
  createdAt: "2026-08-01T00:00:00.000Z"
});

const teamQuest: TeamQuest = {
  id: "quest-1",
  guildId: "guild-1",
  title: "Complete focused work",
  targetType: "FOCUS_MINUTES",
  targetValue: 120,
  currentProgress: 40,
  rewardXp: 100,
  rewardCoins: 25,
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2026-08-08T00:00:00.000Z",
  status: "ACTIVE",
  repeatWeekly: false,
  recurrenceSeriesId: null,
  recurrenceWeekStart: null,
  sourceTeamQuestId: null
};

describe("guild page model", () => {
  it("applies realtime progress only to the matching team quest", () => {
    const untouchedQuest = { ...teamQuest, id: "quest-2" };
    const result = mergeQuestProgress([teamQuest, untouchedQuest], {
      teamQuestId: "quest-1",
      currentProgress: 120,
      targetValue: 120,
      status: "COMPLETED",
      rewardPayout: {
        paidMemberCount: 3,
        xpPerMember: 100,
        coinsPerMember: 25,
        payoutMode: "CONTRIBUTORS"
      }
    });

    expect(result[0]).toMatchObject({
      currentProgress: 120,
      status: "COMPLETED",
      rewardPayout: { paidMemberCount: 3 }
    });
    expect(result[1]).toBe(untouchedQuest);
  });

  it("keeps a listed selection and falls back when it disappears", () => {
    const first = guild("guild-1");
    const selected = guild("guild-2");

    expect(keepSelectedGuild([first, selected], selected)).toBe(selected);
    expect(keepSelectedGuild([first], selected)).toBe(first);
    expect(keepSelectedGuild([], selected)).toBeNull();
  });

  it("matches leaderboard scopes by guild and period", () => {
    const scopes = [
      { guildId: "guild-1", period: "DAILY", rowsWritten: 2 },
      { guildId: "guild-1", period: "WEEKLY", rowsWritten: 5 }
    ];

    expect(findBoardScope(scopes, "guild-1", "WEEKLY")).toEqual(scopes[1]);
    expect(findBoardScope(scopes, "guild-2", "WEEKLY")).toBeUndefined();
    expect(guildMedalClass(1)).toContain("ember");
    expect(guildMedalClass(4)).toContain("ink");
  });
});
