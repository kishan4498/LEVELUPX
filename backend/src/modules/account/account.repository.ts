import { GuildRole, type Prisma, type Role } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

const accountExportSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  twoStepEnabled: true,
  createdAt: true,
  updatedAt: true,
  profile: true,
  projects: true,
  quests: true,
  focusSessions: true,
  xpTransactions: true,
  coinTransactions: true,
  achievements: { include: { achievement: true } },
  skills: { include: { skill: true } },
  cosmetics: { include: { cosmeticItem: true } },
  guildMemberships: {
    include: {
      guild: {
        select: { id: true, name: true, visibility: true }
      }
    }
  },
  insights: true,
  notifications: true,
  notificationPreference: true,
  customRewards: true,
  customRewardRedemptions: { include: { reward: true } },
  outgoingAccountability: {
    include: { recipient: { select: { id: true, name: true } } }
  },
  incomingAccountability: {
    include: { requester: { select: { id: true, name: true } } }
  }
} satisfies Prisma.UserSelect;

export type AccountExportRecord = Prisma.UserGetPayload<{
  select: typeof accountExportSelect;
}>;

export interface IAccountRepository {
  loadAuthData(userId: string): Promise<{ passwordHash: string; role: Role } | null>;
  findExportData(userId: string): Promise<AccountExportRecord | null>;
  deleteUserAndTransferGuilds(userId: string): Promise<void>;
}

export class PrismaAccountRepository implements IAccountRepository {
  loadAuthData(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, role: true }
    });
  }

  findExportData(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: accountExportSelect
    });
  }

  deleteUserAndTransferGuilds(userId: string) {
    return prisma.$transaction(async (tx) => {
      const guilds = await tx.guild.findMany({
        where: { ownerId: userId },
        select: {
          id: true,
          members: {
            where: { userId: { not: userId } },
            orderBy: { joinedAt: "asc" },
            take: 1,
            select: { userId: true }
          }
        }
      });

      for (const guild of guilds) {
        const successor = guild.members[0];

        if (!successor) {
          await tx.guild.delete({ where: { id: guild.id } });
          continue;
        }

        await tx.guild.update({
          where: { id: guild.id },
          data: { ownerId: successor.userId }
        });
        await tx.guildMember.update({
          where: {
            guildId_userId: {
              guildId: guild.id,
              userId: successor.userId
            }
          },
          data: { role: GuildRole.OWNER }
        });
      }

      await tx.user.delete({ where: { id: userId } });
    });
  }
}
