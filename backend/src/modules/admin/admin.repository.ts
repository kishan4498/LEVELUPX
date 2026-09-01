import {
  AbuseReportStatus,
  AbuseSeverity,
  CoinTransactionType,
  MarketplaceListingStatus,
  Prisma,
  Role,
  UserStatus,
  type AbuseReport,
  type AdminAction,
  type AdminReport,
  type CoinTransaction,
  type EconomySettings,
  type User
} from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { prisma } from "../../prisma/client.js";

export type AbuseReportWithUser = AbuseReport & {
  user: {
    id: string;
    name: string;
  };
};

export type RewardSourceAnalytics = {
  sourceType: string;
  totalXp: number;
};

export type CoinTypeAnalytics = {
  type: CoinTransactionType;
  totalCoins: number;
};

export type CoinRewardSourceRecord = Pick<CoinTransaction, "type" | "amount" | "reason">;

export type AdminReportWithUser = AdminReport & {
  adminUser: {
    id: string;
    name: string;
  };
};

export type AdminActionWithUser = AdminAction & {
  adminUser: {
    id: string;
    name: string;
    email: string;
  };
};

const marketplaceListingInclude = {
  seller: { select: { id: true, name: true } },
  buyer: { select: { id: true, name: true } },
  cosmeticItem: true
} satisfies Prisma.MarketplaceListingInclude;

export type AdminMarketplaceListingWithDetails = Prisma.MarketplaceListingGetPayload<{
  include: typeof marketplaceListingInclude;
}>;

export interface IAdminRepository {
  getDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    bannedUsers: number;
    suspendedUsers: number;
    openAbuseReports: number;
    criticalAbuseReports: number;
  }>;
  findUsers(): Promise<User[]>;
  findUserById(userId: string): Promise<User | null>;
  updateUserStatus(change: { adminUserId: string; userId: string; status: UserStatus }): Promise<User>;
  updateUserRole(change: { adminUserId: string; userId: string; role: Role }): Promise<User>;
  findAbuseReports(): Promise<AbuseReportWithUser[]>;
  updateAbuseReport(update: {
    adminUserId: string;
    reportId: string;
    status: AbuseReportStatus;
  }): Promise<AbuseReportWithUser>;
  getEconomySettings(): Promise<EconomySettings>;
  updateEconomySettings(update: {
    adminUserId: string;
    data: {
      xpMultiplier?: number;
      coinMultiplier?: number;
      dailyCoinLimit?: number;
      maxQuestReward?: number;
      inflationRate?: number;
    };
  }): Promise<EconomySettings>;
  getAdminAnalytics(): Promise<{
    activeUsersLast7Days: number;
    xpGeneratedLast30Days: number;
    coinsEarnedLast30Days: number;
    coinsSpentLast30Days: number;
    abuseReportsOpen: number;
    abuseReportsReviewed: number;
    abuseReportsActionTaken: number;
    abuseReportsDismissed: number;
    xpBySourceLast30Days: RewardSourceAnalytics[];
    coinFlowByTypeLast30Days: CoinTypeAnalytics[];
    coinRewardSourcesLast30Days: CoinRewardSourceRecord[];
    rewardCapHitCountLast30Days: number;
    questRewardCountLast30Days: number;
    economySettings: {
      maxQuestReward: number;
      dailyCoinLimit: number;
      inflationRate: number;
    };
    mostActiveGuilds: {
      id: string;
      name: string;
      totalXp: number;
      memberCount: number;
    }[];
  }>;
  createAdminReport(report: {
    adminUserId: string;
    reportType: string;
    format: "CSV" | "PDF";
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageKey?: string | null;
    metadata?: Prisma.InputJsonObject;
  }): Promise<AdminReportWithUser>;
  findAdminReports(): Promise<AdminReportWithUser[]>;
  findAdminReportById(reportId: string): Promise<AdminReportWithUser | null>;
  findAdminActions(): Promise<AdminActionWithUser[]>;
  findMarketplaceListingsForModeration(): Promise<AdminMarketplaceListingWithDetails[]>;
  findMarketplaceTradeHistory(): Promise<AdminMarketplaceListingWithDetails[]>;
  cancelMarketplaceListing(cancellation: { adminUserId: string; listingId: string }): Promise<AdminMarketplaceListingWithDetails>;
}

export class PrismaAdminRepository implements IAdminRepository {
  async getDashboardStats() {
    const [totalUsers, activeUsers, bannedUsers, suspendedUsers, openAbuseReports, criticalAbuseReports] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
        prisma.user.count({ where: { status: UserStatus.BANNED } }),
        prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
        prisma.abuseReport.count({ where: { status: AbuseReportStatus.OPEN } }),
        prisma.abuseReport.count({ where: { severity: AbuseSeverity.CRITICAL } })
      ]);

    return {
      totalUsers,
      activeUsers,
      bannedUsers,
      suspendedUsers,
      openAbuseReports,
      criticalAbuseReports
    };
  }

  findUsers() {
    return prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId }
    });
  }

  updateUserStatus(change: { adminUserId: string; userId: string; status: UserStatus }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: change.userId },
        data: { status: change.status }
      });

      await tx.adminAction.create({
        data: {
          adminUserId: change.adminUserId,
          action: "USER_STATUS_UPDATED",
          targetType: "USER",
          targetId: change.userId,
          metadata: {
            status: change.status
          } satisfies Prisma.InputJsonObject
        }
      });

      return user;
    });
  }

  updateUserRole(change: { adminUserId: string; userId: string; role: Role }) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: change.userId }
      });

      if (!current) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }

      if ((change.role === Role.ADMIN || change.role === Role.SUPER_ADMIN) && !current.twoStepEnabled) {
        throw new AppError("Admin role requires two-step verification on the target account", 409, "ADMIN_TWO_STEP_REQUIRED");
      }

      const user = await tx.user.update({
        where: { id: change.userId },
        data: { role: change.role }
      });

      await tx.adminAction.create({
        data: {
          adminUserId: change.adminUserId,
          action: "USER_ROLE_UPDATED",
          targetType: "USER",
          targetId: change.userId,
          metadata: {
            previousRole: current.role,
            nextRole: change.role
          } satisfies Prisma.InputJsonObject
        }
      });

      return user;
    });
  }

  findAbuseReports() {
    return prisma.abuseReport.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  async updateAbuseReport(update: { adminUserId: string; reportId: string; status: AbuseReportStatus }) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Moving out of OPEN releases the partial unique slot while retaining the
        // stable rule key for audit history. Reopening can therefore conflict with
        // a newer OPEN signal and is translated to a domain-level 409 below.
        const report = await tx.abuseReport.update({
          where: { id: update.reportId },
          data: { status: update.status },
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

        await tx.adminAction.create({
          data: {
            adminUserId: update.adminUserId,
            action: "ABUSE_REPORT_STATUS_UPDATED",
            targetType: "ABUSE_REPORT",
            targetId: update.reportId,
            metadata: {
              status: update.status
            } satisfies Prisma.InputJsonObject
          }
        });

        return report;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(
          "An open automatic report already exists for this user and rule",
          409,
          "ABUSE_SIGNAL_ALREADY_OPEN"
        );
      }

      throw error;
    }
  }

  async getEconomySettings() {
    const settings = await prisma.economySettings.findFirst({
      orderBy: { createdAt: "asc" }
    });

    if (settings) {
      return settings;
    }

    return prisma.economySettings.create({
      data: {}
    });
  }

  async updateEconomySettings(update: {
    adminUserId: string;
    data: {
      xpMultiplier?: number;
      coinMultiplier?: number;
      dailyCoinLimit?: number;
      maxQuestReward?: number;
      inflationRate?: number;
    };
  }) {
    return prisma.$transaction(async (tx) => {
      const current =
        (await tx.economySettings.findFirst({
          orderBy: { createdAt: "asc" }
        })) ??
        (await tx.economySettings.create({
          data: {}
        }));

      const settings = await tx.economySettings.update({
        where: { id: current.id },
        data: {
          ...update.data,
          updatedBy: update.adminUserId
        }
      });

      await tx.adminAction.create({
        data: {
          adminUserId: update.adminUserId,
          action: "ECONOMY_SETTINGS_UPDATED",
          targetType: "ECONOMY_SETTINGS",
          targetId: settings.id,
          metadata: update.data satisfies Prisma.InputJsonObject
        }
      });

      return settings;
    });
  }

  async getAdminAnalytics() {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setUTCDate(now.getUTCDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setUTCDate(now.getUTCDate() - 30);

    const [
      questUsers,
      focusUsers,
      xp,
      earned,
      spent,
      openReports,
      reviewedReports,
      actionedReports,
      dismissedReports,
      xpBySource,
      coinFlowByType,
      coinRewardSources,
      economySettings,
      guilds
    ] = await Promise.all([
      prisma.questCompletion.findMany({
        where: {
          completedAt: {
            gte: sevenDaysAgo
          }
        },
        select: { userId: true },
        distinct: ["userId"]
      }),
      prisma.focusSession.findMany({
        where: {
          startTime: {
            gte: sevenDaysAgo
          }
        },
        select: { userId: true },
        distinct: ["userId"]
      }),
      prisma.xpTransaction.aggregate({
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          }
        },
        _sum: { amount: true }
      }),
      prisma.coinTransaction.aggregate({
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          },
          type: {
            in: ["EARNED", "BONUS", "ADMIN_ADJUSTMENT"]
          }
        },
        _sum: { amount: true }
      }),
      prisma.coinTransaction.aggregate({
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          },
          type: {
            in: ["SPENT", "PENALTY"]
          }
        },
        _sum: { amount: true }
      }),
      prisma.abuseReport.count({ where: { status: AbuseReportStatus.OPEN } }),
      prisma.abuseReport.count({ where: { status: AbuseReportStatus.REVIEWED } }),
      prisma.abuseReport.count({ where: { status: AbuseReportStatus.ACTION_TAKEN } }),
      prisma.abuseReport.count({ where: { status: AbuseReportStatus.DISMISSED } }),
      prisma.xpTransaction.groupBy({
        by: ["sourceType"],
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          }
        },
        _sum: { amount: true }
      }),
      prisma.coinTransaction.groupBy({
        by: ["type"],
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          }
        },
        _sum: { amount: true }
      }),
      prisma.coinTransaction.findMany({
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          },
          type: {
            in: [CoinTransactionType.EARNED, CoinTransactionType.BONUS, CoinTransactionType.ADMIN_ADJUSTMENT]
          }
        },
        select: {
          type: true,
          amount: true,
          reason: true
        }
      }),
      prisma.economySettings.findFirst({
        orderBy: { createdAt: "asc" },
        select: {
          maxQuestReward: true,
          dailyCoinLimit: true,
          inflationRate: true
        }
      }),
      prisma.guild.findMany({
        orderBy: { totalXp: "desc" },
        take: 5,
        include: {
          _count: {
            select: { members: true }
          }
        }
      })
    ]);

    const activeUserIds = new Set([
      ...questUsers.map((user) => user.userId),
      ...focusUsers.map((user) => user.userId)
    ]);
    const settings = economySettings ?? {
      maxQuestReward: 1000,
      dailyCoinLimit: 500,
      inflationRate: 0
    };
    const [capHits, questRewards] = await Promise.all([
      prisma.xpTransaction.count({
        where: {
          sourceType: "QUEST",
          amount: {
            gte: settings.maxQuestReward
          },
          createdAt: {
            gte: thirtyDaysAgo
          }
        }
      }),
      prisma.xpTransaction.count({
        where: {
          sourceType: "QUEST",
          createdAt: {
            gte: thirtyDaysAgo
          }
        }
      })
    ]);

    return {
      activeUsersLast7Days: activeUserIds.size,
      xpGeneratedLast30Days: xp._sum.amount ?? 0,
      coinsEarnedLast30Days: earned._sum.amount ?? 0,
      coinsSpentLast30Days: spent._sum.amount ?? 0,
      abuseReportsOpen: openReports,
      abuseReportsReviewed: reviewedReports,
      abuseReportsActionTaken: actionedReports,
      abuseReportsDismissed: dismissedReports,
      xpBySourceLast30Days: xpBySource.map((source) => ({
        sourceType: source.sourceType,
        totalXp: source._sum.amount ?? 0
      })),
      coinFlowByTypeLast30Days: coinFlowByType.map((flow) => ({
        type: flow.type,
        totalCoins: flow._sum.amount ?? 0
      })),
      coinRewardSourcesLast30Days: coinRewardSources,
      rewardCapHitCountLast30Days: capHits,
      questRewardCountLast30Days: questRewards,
      economySettings: settings,
      mostActiveGuilds: guilds.map((guild) => ({
        id: guild.id,
        name: guild.name,
        totalXp: guild.totalXp,
        memberCount: guild._count.members
      }))
    };
  }

  createAdminReport(report: {
    adminUserId: string;
    reportType: string;
    format: "CSV" | "PDF";
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageKey?: string | null;
    metadata?: Prisma.InputJsonObject;
  }) {
    return prisma.adminReport.create({
      data: {
        adminUserId: report.adminUserId,
        reportType: report.reportType,
        format: report.format,
        filename: report.filename,
        contentType: report.contentType,
        sizeBytes: report.sizeBytes,
        storageKey: report.storageKey ?? null,
        metadata: report.metadata
      },
      include: {
        adminUser: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  findAdminReports() {
    return prisma.adminReport.findMany({
      include: {
        adminUser: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  findAdminReportById(reportId: string) {
    return prisma.adminReport.findUnique({
      where: { id: reportId },
      include: {
        adminUser: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  findAdminActions() {
    return prisma.adminAction.findMany({
      include: {
        adminUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  findMarketplaceListingsForModeration() {
    return prisma.marketplaceListing.findMany({
      include: marketplaceListingInclude,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  findMarketplaceTradeHistory() {
    return prisma.marketplaceListing.findMany({
      include: marketplaceListingInclude,
      orderBy: { createdAt: "desc" },
      take: 500
    });
  }

  cancelMarketplaceListing(cancellation: { adminUserId: string; listingId: string }) {
    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: cancellation.listingId },
        include: marketplaceListingInclude
      });

      if (!listing) {
        throw new AppError("Marketplace listing not found", 404, "MARKETPLACE_LISTING_NOT_FOUND");
      }

      if (listing.status !== MarketplaceListingStatus.ACTIVE) {
        throw new AppError("Only active marketplace listings can be cancelled", 409, "MARKETPLACE_LISTING_NOT_ACTIVE");
      }

      const cancelled = await tx.marketplaceListing.update({
        where: { id: cancellation.listingId },
        data: {
          status: MarketplaceListingStatus.CANCELLED,
          cancelledAt: new Date()
        },
        include: marketplaceListingInclude
      });

      await tx.adminAction.create({
        data: {
          adminUserId: cancellation.adminUserId,
          action: "MARKETPLACE_LISTING_CANCELLED",
          targetType: "MARKETPLACE_LISTING",
          targetId: cancellation.listingId,
          metadata: {
            sellerId: listing.sellerId,
            cosmeticItemId: listing.cosmeticItemId,
            cosmeticName: listing.cosmeticItem.name,
            priceCoins: listing.priceCoins
          } satisfies Prisma.InputJsonObject
        }
      });

      return cancelled;
    });
  }
}
