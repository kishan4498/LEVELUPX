import { CoinTransactionType, GuildRole, GuildVisibility, TeamQuestStatus, type Guild, type Prisma, type TeamQuest } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { AppError } from "../../common/errors/AppError.js";
import { prisma } from "../../prisma/client.js";
import type { CreateTeamQuestInput } from "./guild.types.js";
import { startOfUtcWeek } from "./teamQuestRecurrence.js";

const guildInclude = {
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      joinedAt: "asc"
    }
  }
} satisfies Prisma.GuildInclude;

export type GuildWithMembers = Prisma.GuildGetPayload<{
  include: typeof guildInclude;
}>;

type TeamQuestPayoutMode = "CONTRIBUTORS" | "ALL_MEMBERS";

export type TeamQuestProgressResult = {
  teamQuest: TeamQuest;
  rewardPayout: {
    paidMemberCount: number;
    xpPerMember: number;
    coinsPerMember: number;
    payoutMode: TeamQuestPayoutMode;
  } | null;
};

export interface IGuildRepository {
  create(guildDraft: { ownerId: string; name: string; description?: string; visibility: GuildVisibility; inviteCodeHash?: string }): Promise<GuildWithMembers>;
  findMany(userId: string): Promise<Guild[]>;
  findById(id: string): Promise<GuildWithMembers | null>;
  findMember(memberKey: { guildId: string; userId: string }): Promise<{ role: GuildRole } | null>;
  join(membership: { guildId: string; userId: string }): Promise<GuildWithMembers>;
  leave(membership: { guildId: string; userId: string }): Promise<void>;
  updateInviteCodeHash(guildId: string, inviteCodeHash: string): Promise<void>;
  launchTeamQuest(guildId: string, questDraft: CreateTeamQuestInput): Promise<TeamQuest>;
  findTeamQuests(guildId: string): Promise<TeamQuest[]>;
  findTeamQuest(questKey: { guildId: string; teamQuestId: string }): Promise<TeamQuest | null>;
  logTeamQuestProgress(update: { teamQuest: TeamQuest; userId: string; progressDelta: number }): Promise<TeamQuestProgressResult>;
}

export class PrismaGuildRepository implements IGuildRepository {
  create(guildDraft: { ownerId: string; name: string; description?: string; visibility: GuildVisibility; inviteCodeHash?: string }) {
    return prisma.$transaction(async (tx) => {
      // A guild must never exist without its owner membership.
      const guild = await tx.guild.create({
        data: {
          name: guildDraft.name,
          description: guildDraft.description,
          ownerId: guildDraft.ownerId,
          visibility: guildDraft.visibility,
          inviteCodeHash: guildDraft.inviteCodeHash
        }
      });

      await tx.guildMember.create({
        data: {
          guildId: guild.id,
          userId: guildDraft.ownerId,
          role: GuildRole.OWNER
        }
      });

      const created = await tx.guild.findUnique({
        where: { id: guild.id },
        include: guildInclude
      });

      if (!created) {
        throw new Error("Created guild could not be loaded");
      }

      return created;
    });
  }

  findMany(userId: string) {
    return prisma.guild.findMany({
      where: {
        OR: [
          { visibility: GuildVisibility.PUBLIC },
          { members: { some: { userId } } }
        ]
      },
      orderBy: { createdAt: "desc" }
    });
  }

  findById(id: string) {
    return prisma.guild.findUnique({
      where: { id },
      include: guildInclude
    });
  }

  findMember(memberKey: { guildId: string; userId: string }) {
    return prisma.guildMember.findUnique({
      where: {
        guildId_userId: {
          guildId: memberKey.guildId,
          userId: memberKey.userId
        }
      },
      select: {
        role: true
      }
    });
  }

  async join(membership: { guildId: string; userId: string }) {
    await prisma.guildMember.create({
      data: {
        guildId: membership.guildId,
        userId: membership.userId,
        role: GuildRole.MEMBER
      }
    });

    const guild = await this.findById(membership.guildId);

    if (!guild) {
      throw new Error("Joined guild could not be loaded");
    }

    return guild;
  }

  async leave(membership: { guildId: string; userId: string }) {
    await prisma.guildMember.delete({
      where: {
        guildId_userId: {
          guildId: membership.guildId,
          userId: membership.userId
        }
      }
    });
  }

  async updateInviteCodeHash(guildId: string, inviteCodeHash: string) {
    await prisma.guild.update({
      where: { id: guildId },
      data: { inviteCodeHash }
    });
  }

  launchTeamQuest(guildId: string, questDraft: CreateTeamQuestInput) {
    const id = randomUUID();
    const startDate = new Date(questDraft.startDate);
    const repeatWeekly = questDraft.repeatWeekly ?? false;

    return prisma.teamQuest.create({
      data: {
        id,
        guildId,
        title: questDraft.title,
        targetType: questDraft.targetType,
        targetValue: questDraft.targetValue,
        rewardXp: questDraft.rewardXp,
        rewardCoins: questDraft.rewardCoins,
        startDate,
        endDate: new Date(questDraft.endDate),
        repeatWeekly,
        recurrenceSeriesId: repeatWeekly ? id : null,
        recurrenceWeekStart: repeatWeekly ? startOfUtcWeek(startDate) : null
      }
    });
  }

  findTeamQuests(guildId: string) {
    return prisma.teamQuest.findMany({
      where: { guildId },
      orderBy: [{ status: "asc" }, { endDate: "asc" }]
    });
  }

  findTeamQuest(questKey: { guildId: string; teamQuestId: string }) {
    return prisma.teamQuest.findFirst({
      where: {
        id: questKey.teamQuestId,
        guildId: questKey.guildId
      }
    });
  }

  logTeamQuestProgress(update: { teamQuest: TeamQuest; userId: string; progressDelta: number }): Promise<TeamQuestProgressResult> {
    const progress = Math.min(update.teamQuest.targetValue, update.teamQuest.currentProgress + update.progressDelta);
    const status = progress >= update.teamQuest.targetValue ? TeamQuestStatus.COMPLETED : update.teamQuest.status;

    return prisma.$transaction(async (tx) => {
      // The active-status guard prevents duplicate payouts from racing updates.
      const updated = await tx.teamQuest.updateMany({
        where: {
          id: update.teamQuest.id,
          guildId: update.teamQuest.guildId,
          status: TeamQuestStatus.ACTIVE
        },
        data: {
          currentProgress: progress,
          status
        }
      });

      if (updated.count === 0) {
        throw new AppError("Only active team quests can receive progress", 409, "TEAM_QUEST_NOT_ACTIVE");
      }

      const teamQuest = await tx.teamQuest.findUnique({
        where: { id: update.teamQuest.id }
      });

      if (!teamQuest) {
        throw new AppError("Team quest not found", 404, "TEAM_QUEST_NOT_FOUND");
      }

      // Prefer contributors, but keep all members as the no-contribution fallback.
      await tx.teamQuestContribution.upsert({
        where: {
          teamQuestId_userId: {
            teamQuestId: teamQuest.id,
            userId: update.userId
          }
        },
        create: {
          teamQuestId: teamQuest.id,
          userId: update.userId,
          progress: update.progressDelta
        },
        update: {
          progress: {
            increment: update.progressDelta
          }
        }
      });

      const payout = status === TeamQuestStatus.COMPLETED ? await this.payRewards(tx, teamQuest) : null;

      return {
        teamQuest,
        rewardPayout: payout
      };
    });
  }

  private async payRewards(tx: Prisma.TransactionClient, teamQuest: TeamQuest) {
    const contributors = await tx.teamQuestContribution.findMany({
      where: {
        teamQuestId: teamQuest.id,
        progress: {
          gt: 0
        }
      },
      select: { userId: true }
    });
    const mode: TeamQuestPayoutMode = contributors.length > 0 ? "CONTRIBUTORS" : "ALL_MEMBERS";
    const recipients =
      contributors.length > 0
        ? contributors
        : await tx.guildMember.findMany({
            where: { guildId: teamQuest.guildId },
            select: { userId: true }
          });
    let paid = 0;

    for (const member of recipients) {
      // A broken profile should not block payouts for the rest of the guild.
      const profile = await tx.userProfile.findUnique({
        where: { userId: member.userId }
      });

      if (!profile) {
        continue;
      }

      // Atomic increments preserve concurrent balance updates.
      const updated = await tx.userProfile.update({
        where: { userId: member.userId },
        data: {
          totalXp: { increment: teamQuest.rewardXp },
          coins: { increment: teamQuest.rewardCoins }
        },
        select: { totalXp: true, coins: true, level: true }
      });

      const level = Math.floor(updated.totalXp / 1000) + 1;

      if (updated.level !== level) {
        await tx.userProfile.update({
          where: { userId: member.userId },
          data: { level }
        });
      }

      if (teamQuest.rewardXp > 0) {
        await tx.xpTransaction.create({
          data: {
            userId: member.userId,
            sourceType: "TEAM_QUEST",
            sourceId: teamQuest.id,
            amount: teamQuest.rewardXp,
            multiplier: 1,
            reason: `Completed team quest: ${teamQuest.title}`
          }
        });
      }

      if (teamQuest.rewardCoins > 0) {
        await tx.coinTransaction.create({
          data: {
            userId: member.userId,
            type: CoinTransactionType.BONUS,
            amount: teamQuest.rewardCoins,
            reason: `Completed team quest: ${teamQuest.title}`,
            balanceAfter: updated.coins
          }
        });
      }

      paid += 1;
    }

    if (teamQuest.rewardXp > 0) {
      await tx.guild.update({
        where: { id: teamQuest.guildId },
        data: {
          totalXp: {
            increment: teamQuest.rewardXp
          }
        }
      });
    }

    return {
      paidMemberCount: paid,
      xpPerMember: teamQuest.rewardXp,
      coinsPerMember: teamQuest.rewardCoins,
      payoutMode: mode
    };
  }
}
