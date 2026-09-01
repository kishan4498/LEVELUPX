import { LeaderboardPeriod, type GuildRole, type Prisma } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

const leaderboardUserSelect = {
  id: true,
  name: true,
  profile: {
    select: {
      totalXp: true
    }
  },
  xpTransactions: {
    select: {
      amount: true
    }
  },
  focusSessions: {
    select: {
      durationMinutes: true
    }
  }
} satisfies Prisma.UserSelect;

const snapshotInclude = {
  user: {
    select: { name: true }
  }
} satisfies Prisma.LeaderboardInclude;

export type LeaderboardCandidate = Prisma.UserGetPayload<{
  select: typeof leaderboardUserSelect;
}>;

export type LeaderboardSnapshotRow = {
  rank: number;
  userId: string;
  name: string;
  xp: number;
  focusMinutes: number;
  period: LeaderboardPeriod;
  updatedAt: Date;
};

type SnapshotRecord = Prisma.LeaderboardGetPayload<{
  include: typeof snapshotInclude;
}>;

export interface ILeaderboardRepository {
  findGlobalCandidates(query: { period: LeaderboardPeriod; from?: Date; limit: number }): Promise<LeaderboardCandidate[]>;
  findGlobalSnapshot(query: { period: LeaderboardPeriod; limit: number }): Promise<LeaderboardSnapshotRow[]>;
  findGuildCandidates(query: {
    guildId: string;
    period: LeaderboardPeriod;
    from?: Date;
    limit: number;
  }): Promise<LeaderboardCandidate[]>;
  findGuildSnapshot(query: {
    guildId: string;
    period: LeaderboardPeriod;
    limit: number;
  }): Promise<LeaderboardSnapshotRow[]>;
  findGuildMember(memberKey: { guildId: string; userId: string }): Promise<{ role: GuildRole } | null>;
  findGuildIds(): Promise<string[]>;
  replaceSnapshot(snapshot: {
    guildId: string | null;
    period: LeaderboardPeriod;
    rows: { userId: string; rank: number; xp: number; focusMinutes: number }[];
  }): Promise<number>;
}

export class PrismaLeaderboardRepository implements ILeaderboardRepository {
  findGlobalCandidates(query: { period: LeaderboardPeriod; from?: Date; limit: number }) {
    return prisma.user.findMany({
      where: {
        status: "ACTIVE"
      },
      select: this.selectForPeriod(query.from),
      take: query.limit * 3
    });
  }

  async findGlobalSnapshot(query: { period: LeaderboardPeriod; limit: number }) {
    const snapshots = await prisma.leaderboard.findMany({
      where: {
        guildId: null,
        period: query.period
      },
      include: snapshotInclude,
      orderBy: { rank: "asc" },
      take: query.limit
    });

    return snapshots.map(toSnapshotRow);
  }

  findGuildCandidates(query: { guildId: string; period: LeaderboardPeriod; from?: Date; limit: number }) {
    return prisma.user.findMany({
      where: {
        status: "ACTIVE",
        guildMemberships: {
          some: {
            guildId: query.guildId
          }
        }
      },
      select: this.selectForPeriod(query.from),
      take: query.limit * 3
    });
  }

  async findGuildSnapshot(query: { guildId: string; period: LeaderboardPeriod; limit: number }) {
    const snapshots = await prisma.leaderboard.findMany({
      where: {
        guildId: query.guildId,
        period: query.period
      },
      include: snapshotInclude,
      orderBy: { rank: "asc" },
      take: query.limit
    });

    return snapshots.map(toSnapshotRow);
  }

  findGuildMember(memberKey: { guildId: string; userId: string }) {
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

  async findGuildIds() {
    const guilds = await prisma.guild.findMany({
      select: { id: true },
      orderBy: { createdAt: "asc" }
    });

    return guilds.map((guild) => guild.id);
  }

  async replaceSnapshot(snapshot: {
    guildId: string | null;
    period: LeaderboardPeriod;
    rows: { userId: string; rank: number; xp: number; focusMinutes: number }[];
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.leaderboard.deleteMany({
        where: {
          guildId: snapshot.guildId,
          period: snapshot.period
        }
      });

      if (snapshot.rows.length === 0) {
        return 0;
      }

      const created = await tx.leaderboard.createMany({
        data: snapshot.rows.map((ranking) => ({
          userId: ranking.userId,
          guildId: snapshot.guildId,
          period: snapshot.period,
          xp: ranking.xp,
          focusMinutes: ranking.focusMinutes,
          rank: ranking.rank
        }))
      });

      return created.count;
    });
  }

  private selectForPeriod(from?: Date) {
    return {
      ...leaderboardUserSelect,
      xpTransactions: {
        where: from
          ? {
              createdAt: {
                gte: from
              }
            }
          : undefined,
        select: {
          amount: true
        }
      },
      focusSessions: {
        where: {
          ...(from
            ? {
                startTime: {
                  gte: from
                }
              }
            : {}),
          durationMinutes: {
            not: null
          }
        },
        select: {
          durationMinutes: true
        }
      }
    } satisfies Prisma.UserSelect;
  }
}

function toSnapshotRow(snapshot: SnapshotRecord): LeaderboardSnapshotRow {
  return {
    rank: snapshot.rank,
    userId: snapshot.userId,
    name: snapshot.user.name,
    xp: snapshot.xp,
    focusMinutes: snapshot.focusMinutes,
    period: snapshot.period,
    updatedAt: snapshot.updatedAt
  };
}
