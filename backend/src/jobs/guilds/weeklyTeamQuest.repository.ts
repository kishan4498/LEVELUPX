import { Prisma, TeamQuestStatus, type TeamQuest } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type NextWeeklyTeamQuest = {
  startDate: Date;
  endDate: Date;
  recurrenceWeekStart: Date;
};

export interface IWeeklyTeamQuestRepository {
  findRecurringTeamQuests(): Promise<TeamQuest[]>;
  createNext(source: TeamQuest, next: NextWeeklyTeamQuest): Promise<TeamQuest | null>;
}

export class PrismaWeeklyTeamQuestRepository implements IWeeklyTeamQuestRepository {
  findRecurringTeamQuests() {
    return prisma.teamQuest.findMany({
      where: {
        repeatWeekly: true
      },
      orderBy: [{ recurrenceSeriesId: "asc" }, { recurrenceWeekStart: "desc" }]
    });
  }

  async createNext(source: TeamQuest, next: NextWeeklyTeamQuest) {
    try {
      return await prisma.teamQuest.create({
        data: {
          guildId: source.guildId,
          title: source.title,
          targetType: source.targetType,
          targetValue: source.targetValue,
          currentProgress: 0,
          rewardXp: source.rewardXp,
          rewardCoins: source.rewardCoins,
          startDate: next.startDate,
          endDate: next.endDate,
          status: TeamQuestStatus.ACTIVE,
          repeatWeekly: true,
          recurrenceSeriesId: source.recurrenceSeriesId,
          recurrenceWeekStart: next.recurrenceWeekStart,
          sourceTeamQuestId: source.id
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }

      throw error;
    }
  }
}
