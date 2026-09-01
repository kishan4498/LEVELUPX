import { GuildRole, TeamQuestStatus, type TeamQuest } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { GuildWithMembers, IGuildRepository, TeamQuestProgressResult } from "./guild.repository.js";
import { GuildService } from "./guild.service.js";

function makeGuild(): GuildWithMembers {
  const createdAt = new Date("2026-05-20T00:00:00.000Z");

  return {
    id: "guild-1",
    name: "Study Guild",
    description: null,
    ownerId: "user-1",
    totalXp: 0,
    visibility: "PUBLIC",
    inviteCodeHash: null,
    createdAt,
    members: [
      {
        id: "member-1",
        guildId: "guild-1",
        userId: "user-1",
        role: GuildRole.OWNER,
        joinedAt: createdAt,
        user: {
          id: "user-1",
          name: "Owner"
        }
      }
    ]
  };
}

function makeTeamQuest(patch: Partial<TeamQuest> = {}): TeamQuest {
  return {
    id: "team-quest-1",
    guildId: "guild-1",
    title: "Weekly Sprint",
    targetType: "QUESTS_COMPLETED",
    targetValue: 10,
    currentProgress: 8,
    rewardXp: 100,
    rewardCoins: 25,
    startDate: new Date("2026-05-20T00:00:00.000Z"),
    endDate: new Date("2026-05-27T00:00:00.000Z"),
    status: TeamQuestStatus.ACTIVE,
    repeatWeekly: false,
    recurrenceSeriesId: null,
    recurrenceWeekStart: null,
    sourceTeamQuestId: null,
    ...patch
  };
}

function makeRepo(progress: TeamQuestProgressResult) {
  const repo: IGuildRepository & {
    lastProgressInput?: Parameters<IGuildRepository["logTeamQuestProgress"]>[0];
  } = {
    lastProgressInput: undefined,
    async create() {
      return makeGuild();
    },
    async findMany() {
      return [];
    },
    async findById() {
      return makeGuild();
    },
    async findMember() {
      return { role: GuildRole.OWNER };
    },
    async join() {
      return makeGuild();
    },
    async leave() {},
    async updateInviteCodeHash() {},
    async launchTeamQuest() {
      return makeTeamQuest();
    },
    async findTeamQuests() {
      return [];
    },
    async findTeamQuest() {
      return makeTeamQuest();
    },
    async logTeamQuestProgress(update) {
      repo.lastProgressInput = update;
      return progress;
    }
  };

  return repo;
}

describe("GuildService team quest progress", () => {
  it("returns payout details when progress completes a team quest", async () => {
    const completed = makeTeamQuest({
      currentProgress: 10,
      status: TeamQuestStatus.COMPLETED
    });
    const service = new GuildService(
      makeRepo({
        teamQuest: completed,
        rewardPayout: {
          paidMemberCount: 3,
          xpPerMember: 100,
          coinsPerMember: 25,
          payoutMode: "CONTRIBUTORS"
        }
      }),
      () => new Date("2026-05-23T00:00:00.000Z")
    );

    const view = await service.logTeamQuestProgress("user-1", "guild-1", "team-quest-1", {
      progressDelta: 2
    });

    expect(view.status).toBe(TeamQuestStatus.COMPLETED);
    expect(view.rewardPayout).toEqual({
      paidMemberCount: 3,
      xpPerMember: 100,
      coinsPerMember: 25,
      payoutMode: "CONTRIBUTORS"
    });
  });

  it("omits payout details while the team quest remains active", async () => {
    const service = new GuildService(
      makeRepo({
        teamQuest: makeTeamQuest({
          currentProgress: 9,
          status: TeamQuestStatus.ACTIVE
        }),
        rewardPayout: null
      }),
      () => new Date("2026-05-23T00:00:00.000Z")
    );

    const view = await service.logTeamQuestProgress("user-1", "guild-1", "team-quest-1", {
      progressDelta: 1
    });

    expect(view.status).toBe(TeamQuestStatus.ACTIVE);
    expect(view.rewardPayout).toBeUndefined();
  });

  it("passes the contributor user id when updating progress", async () => {
    const repo = makeRepo({
      teamQuest: makeTeamQuest({
        currentProgress: 9,
        status: TeamQuestStatus.ACTIVE
      }),
      rewardPayout: null
    });
    const service = new GuildService(repo, () => new Date("2026-05-23T00:00:00.000Z"));

    await service.logTeamQuestProgress("user-1", "guild-1", "team-quest-1", {
      progressDelta: 1
    });

    expect(repo.lastProgressInput).toMatchObject({
      userId: "user-1",
      progressDelta: 1
    });
  });

  it("rejects progress after a team quest has expired", async () => {
    const repo = makeRepo({ teamQuest: makeTeamQuest(), rewardPayout: null });
    const service = new GuildService(repo, () => new Date("2026-05-28T00:00:00.000Z"));

    await expect(
      service.logTeamQuestProgress("user-1", "guild-1", "team-quest-1", { progressDelta: 1 })
    ).rejects.toMatchObject({ code: "TEAM_QUEST_NOT_ACTIVE" });
  });
});
