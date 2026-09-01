import { CoinTransactionType, MarketplaceListingStatus, Role, UserStatus, type AdminAction, type AdminReport, type User } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IPrometheusMonitoringClient } from "../../common/monitoring/prometheusMonitoring.js";
import type { AdminMarketplaceListingWithDetails, IAdminRepository } from "./admin.repository.js";
import { AdminService } from "./admin.service.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeRepository(): IAdminRepository {
  return {
    async getDashboardStats() {
      return {
        totalUsers: 0,
        activeUsers: 0,
        bannedUsers: 0,
        suspendedUsers: 0,
        openAbuseReports: 0,
        criticalAbuseReports: 0
      };
    },
    async findUsers() {
      return [];
    },
    async findUserById(userId: string) {
      return userId.includes("admin")
        ? makeUser({ id: userId, email: `${userId}@example.com`, role: Role.SUPER_ADMIN, twoStepEnabled: true })
        : makeUser({ id: userId, email: `${userId}@example.com`, role: Role.USER, twoStepEnabled: true });
    },
    async updateUserStatus() {
      throw new Error("Not needed in this test");
    },
    async updateUserRole() {
      throw new Error("Not needed in this test");
    },
    async findAbuseReports() {
      return [];
    },
    async updateAbuseReport() {
      throw new Error("Not needed in this test");
    },
    async getEconomySettings() {
      throw new Error("Not needed in this test");
    },
    async updateEconomySettings() {
      throw new Error("Not needed in this test");
    },
    async createAdminReport(report) {
      return makeAdminReport({
        adminUserId: report.adminUserId,
        reportType: report.reportType,
        format: report.format,
        filename: report.filename,
        contentType: report.contentType,
        sizeBytes: report.sizeBytes,
        storageKey: report.storageKey ?? null
      });
    },
    async findAdminReports() {
      return [];
    },
    async findAdminReportById() {
      return null;
    },
    async findAdminActions() {
      return [];
    },
    async findMarketplaceListingsForModeration() {
      return [];
    },
    async findMarketplaceTradeHistory() {
      return [];
    },
    async cancelMarketplaceListing() {
      throw new Error("Not needed in this test");
    },
    async getAdminAnalytics() {
      return {
        activeUsersLast7Days: 4,
        xpGeneratedLast30Days: 300,
        coinsEarnedLast30Days: 95,
        coinsSpentLast30Days: 20,
        abuseReportsOpen: 1,
        abuseReportsReviewed: 2,
        abuseReportsActionTaken: 3,
        abuseReportsDismissed: 4,
        xpBySourceLast30Days: [
          { sourceType: "QUEST", totalXp: 200 },
          { sourceType: "ACHIEVEMENT", totalXp: 100 }
        ],
        coinFlowByTypeLast30Days: [
          { type: CoinTransactionType.EARNED, totalCoins: 50 },
          { type: CoinTransactionType.BONUS, totalCoins: 45 },
          { type: CoinTransactionType.SPENT, totalCoins: 20 }
        ],
        coinRewardSourcesLast30Days: [
          { type: CoinTransactionType.EARNED, amount: 50, reason: "Completed quest: Write notes" },
          { type: CoinTransactionType.BONUS, amount: 15, reason: "Unlocked achievement: First Quest" },
          { type: CoinTransactionType.BONUS, amount: 30, reason: "Completed team quest: Weekly Sprint" },
          { type: CoinTransactionType.ADMIN_ADJUSTMENT, amount: 5, reason: "Manual grant" }
        ],
        rewardCapHitCountLast30Days: 3,
        questRewardCountLast30Days: 10,
        economySettings: {
          maxQuestReward: 100,
          dailyCoinLimit: 500,
          inflationRate: 50
        },
        mostActiveGuilds: []
      };
    }
  };
}

describe("AdminService analytics", () => {
  it("builds reward source and coin flow breakdowns", async () => {
    const analytics = await new AdminService(makeRepository()).analytics();

    expect(analytics.activeUsersLast7Days).toBe(4);
    expect(analytics.coinInflationLast30Days).toEqual({
      earned: 95,
      spent: 20,
      net: 75
    });
    expect(analytics.coinFlowByTypeLast30Days).toEqual([
      { type: CoinTransactionType.EARNED, amount: 50 },
      { type: CoinTransactionType.BONUS, amount: 45 },
      { type: CoinTransactionType.SPENT, amount: 20 }
    ]);
    expect(analytics.rewardSourcesLast30Days).toEqual([
      { sourceType: "QUEST", xp: 200, coins: 50 },
      { sourceType: "ACHIEVEMENT", xp: 100, coins: 15 },
      { sourceType: "TEAM_QUEST", xp: 0, coins: 30 },
      { sourceType: "ADMIN_ADJUSTMENT", xp: 0, coins: 5 }
    ]);
    expect(analytics.economySafeguards).toEqual([
      {
        key: "XP_GENERATION",
        label: "XP generation pressure",
        level: "OK",
        currentValue: 75,
        threshold: 300,
        detail: "Average XP generated per active user over the last 30 days.",
        recommendation: "No enforcement action recommended.",
        enforcementAction: {
          type: "NONE",
          label: "No action needed",
          status: "NO_ACTION"
        }
      },
      {
        key: "COIN_INFLATION",
        label: "Coin inflation pressure",
        level: "RISK",
        currentValue: 79,
        threshold: 50,
        detail: "Net retained coin flow as a percentage of coin inflow over the last 30 days.",
        recommendation: "Review coin multiplier, daily coin limit, and coin sinks before increasing rewards.",
        enforcementAction: {
          type: "REDUCE_REWARD_PRESSURE",
          label: "Review coin reward pressure",
          status: "RECOMMENDED"
        }
      },
      {
        key: "REWARD_CAP_PRESSURE",
        label: "Reward cap pressure",
        level: "RISK",
        currentValue: 30,
        threshold: 20,
        detail: "Percentage of quest XP rewards that reached the configured max quest reward cap.",
        recommendation: "Review max quest reward and high-difficulty quest calibration before raising caps.",
        enforcementAction: {
          type: "REVIEW_REWARD_CAP",
          label: "Review quest reward cap",
          status: "RECOMMENDED"
        }
      }
    ]);
    expect(analytics.abuseReports).toEqual({
      open: 1,
      reviewed: 2,
      actionTaken: 3,
      dismissed: 4
    });
  });

  it("exports analytics as CSV", async () => {
    const repository = {
      ...makeRepository(),
      async getAdminAnalytics() {
        const analytics = await makeRepository().getAdminAnalytics();

        return {
          ...analytics,
          mostActiveGuilds: [
            {
              id: "guild-1",
              name: 'Writers, "Night Shift"',
              totalXp: 1200,
              memberCount: 8
            }
          ]
        };
      }
    };

    const report = await new AdminService(repository).exportAnalytics("admin-1", { format: "csv" });

    expect(report.contentType).toBe("text/csv; charset=utf-8");
    expect(report.filename).toMatch(/^levelupx-admin-analytics-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(typeof report.body).toBe("string");
    if (typeof report.body !== "string") {
      throw new Error("Expected CSV export body to be a string");
    }
    expect(report.body.split("\n")[0]).toBe("section,metric,value,detail");
    expect(report.body).toContain("summary,activeUsersLast7Days,4,");
    expect(report.body).toContain("rewardSource,QUEST,200,50 coins");
    expect(report.body).toContain('guild,"Writers, ""Night Shift""",1200,8 members');
  });

  it("exports analytics as PDF", async () => {
    const repository = {
      ...makeRepository(),
      async getAdminAnalytics() {
        const analytics = await makeRepository().getAdminAnalytics();

        return {
          ...analytics,
          mostActiveGuilds: [
            {
              id: "guild-1",
              name: "Writers (Night Shift)",
              totalXp: 1200,
              memberCount: 8
            }
          ]
        };
      }
    };

    const report = await new AdminService(repository).exportAnalytics("admin-1", { format: "pdf" });
    const body = report.body.toString();

    expect(Buffer.isBuffer(report.body)).toBe(true);
    expect(report.contentType).toBe("application/pdf");
    expect(report.filename).toMatch(/^levelupx-admin-analytics-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("LevelUpX Admin Analytics");
    expect(body).toContain("Active users last 7 days: 4");
    expect(body).toContain("Writers \\(Night Shift\\): 1200 XP, 8 members");
    expect(body).toContain("%%EOF");
  });

  it("records generated report history", async () => {
    const recordedReports: { adminUserId: string; format: "CSV" | "PDF"; filename: string; sizeBytes: number }[] = [];
    const repository = {
      ...makeRepository(),
      async createAdminReport(report: {
        adminUserId: string;
        reportType: string;
        format: "CSV" | "PDF";
        filename: string;
        contentType: string;
        sizeBytes: number;
      }) {
        recordedReports.push(report);
        return makeAdminReport({
          adminUserId: report.adminUserId,
          reportType: report.reportType,
          format: report.format,
          filename: report.filename,
          contentType: report.contentType,
          sizeBytes: report.sizeBytes
        });
      }
    };

    await new AdminService(repository).exportAnalytics("admin-1", { format: "pdf" });

    expect(recordedReports).toEqual([
      expect.objectContaining({
        adminUserId: "admin-1",
        format: "PDF",
        filename: expect.stringMatching(/^levelupx-admin-analytics-\d{4}-\d{2}-\d{2}\.pdf$/),
        sizeBytes: expect.any(Number)
      })
    ]);
    expect(recordedReports[0].sizeBytes).toBeGreaterThan(0);
  });

  it("lists recent report history", async () => {
    const repository = {
      ...makeRepository(),
      async findAdminReports() {
        return [
          makeAdminReport({
            id: "report-1",
            adminUserId: "admin-1",
            reportType: "ADMIN_ANALYTICS",
            format: "CSV",
            filename: "levelupx-admin-analytics-2026-05-21.csv",
            contentType: "text/csv; charset=utf-8",
            sizeBytes: 200,
            createdAt: new Date("2026-05-21T10:00:00.000Z")
          })
        ];
      }
    };

    const reports = await new AdminService(repository).reports();

    expect(reports).toEqual([
      {
        id: "report-1",
        reportType: "ADMIN_ANALYTICS",
        format: "CSV",
        filename: "levelupx-admin-analytics-2026-05-21.csv",
        contentType: "text/csv; charset=utf-8",
        sizeBytes: 200,
        storageKey: null,
        createdAt: "2026-05-21T10:00:00.000Z",
        generatedBy: {
          id: "admin-1",
          name: "Admin One"
        }
      }
    ]);
  });

  it("downloads stored report files", async () => {
    const repository = {
      ...makeRepository(),
      async findAdminReportById(reportId: string) {
        return makeAdminReport({
          id: reportId,
          filename: "weekly.csv",
          contentType: "text/csv; charset=utf-8",
          storageKey: "2026-05-21/weekly.csv"
        });
      }
    };
    const storage = {
      async store() {
        return null;
      },
      async read(storageKey: string) {
        return {
          body: Buffer.from(`storageKey,${storageKey}`),
          sizeBytes: 34
        };
      }
    };

    const report = await new AdminService(repository, storage).downloadReport("report-1");

    expect(report.filename).toBe("weekly.csv");
    expect(report.contentType).toBe("text/csv; charset=utf-8");
    expect(report.body.toString()).toBe("storageKey,2026-05-21/weekly.csv");
  });

  it("blocks downloads for metadata-only reports", async () => {
    const repository = {
      ...makeRepository(),
      async findAdminReportById() {
        return makeAdminReport({
          storageKey: null
        });
      }
    };

    await expect(new AdminService(repository).downloadReport("report-1")).rejects.toMatchObject({
      code: "ADMIN_REPORT_FILE_UNAVAILABLE",
      statusCode: 409
    });
  });

  it("returns not found for missing stored report files", async () => {
    const repository = {
      ...makeRepository(),
      async findAdminReportById() {
        return makeAdminReport({
          storageKey: "missing.csv"
        });
      }
    };
    const storage = {
      async store() {
        return null;
      },
      async read() {
        return null;
      }
    };

    await expect(new AdminService(repository, storage).downloadReport("report-1")).rejects.toMatchObject({
      code: "ADMIN_REPORT_FILE_NOT_FOUND",
      statusCode: 404
    });
  });

  it("lists recent admin audit actions", async () => {
    const repository = {
      ...makeRepository(),
      async findAdminActions() {
        return [
          makeAdminAction({
            id: "action-1",
            action: "USER_ROLE_UPDATED",
            targetType: "USER",
            targetId: "user-1",
            metadata: {
              previousRole: "USER",
              nextRole: "ADMIN"
            },
            createdAt: new Date("2026-05-21T09:30:00.000Z")
          })
        ];
      }
    };

    const actions = await new AdminService(repository).auditActions();

    expect(actions).toEqual([
      {
        id: "action-1",
        action: "USER_ROLE_UPDATED",
        targetType: "USER",
        targetId: "user-1",
        metadata: {
          previousRole: "USER",
          nextRole: "ADMIN"
        },
        createdAt: "2026-05-21T09:30:00.000Z",
        actor: {
          id: "admin-1",
          name: "Admin One",
          email: "admin@example.com"
        }
      }
    ]);
  });
});

describe("AdminService role management", () => {
  it("updates another user's role", async () => {
    let roleUpdateRequest: { adminUserId: string; userId: string; role: Role } | null = null;
    const repository = {
      ...makeRepository(),
      async updateUserRole(change: { adminUserId: string; userId: string; role: Role }) {
        roleUpdateRequest = change;
        return makeUser({
          id: change.userId,
          role: change.role
        });
      }
    };

    const user = await new AdminService(repository).updateUserRole("super-admin-1", "user-1", {
      role: Role.ADMIN
    });

    expect(roleUpdateRequest).toEqual({
      adminUserId: "super-admin-1",
      userId: "user-1",
      role: Role.ADMIN
    });
    expect(user.role).toBe(Role.ADMIN);
  });

  it("blocks self role changes", async () => {
    const service = new AdminService(makeRepository());

    await expect(
      service.updateUserRole("super-admin-1", "super-admin-1", {
        role: Role.ADMIN
      })
    ).rejects.toMatchObject({
      code: "ADMIN_SELF_ROLE_CHANGE",
      statusCode: 409
    });
  });
});

describe("AdminService marketplace moderation", () => {
  it("lists marketplace listings for moderation", async () => {
    const repository = {
      ...makeRepository(),
      async findMarketplaceListingsForModeration() {
        return [makeListing()];
      }
    };

    await expect(new AdminService(repository).marketplaceListings()).resolves.toEqual([
      {
        id: "listing-1",
        sellerId: "seller-1",
        sellerName: "Seller One",
        buyerId: null,
        buyerName: null,
        cosmetic: {
          id: "cosmetic-1",
          name: "Trade Frame",
          description: "A frame for trades.",
          slot: "AVATAR_FRAME",
          rarity: "EPIC"
        },
        priceCoins: 120,
        status: "ACTIVE",
        createdAt: "2026-05-21T00:00:00.000Z",
        soldAt: null,
        cancelledAt: null
      }
    ]);
  });

  it("cancels a marketplace listing through the repository", async () => {
    let moderationRequest: { adminUserId: string; listingId: string } | null = null;
    const repository = {
      ...makeRepository(),
      async cancelMarketplaceListing(cancellation: { adminUserId: string; listingId: string }) {
        moderationRequest = cancellation;
        return makeListing({
          status: MarketplaceListingStatus.CANCELLED,
          cancelledAt: new Date("2026-05-21T01:00:00.000Z")
        });
      }
    };

    await expect(new AdminService(repository).cancelMarketplaceListing("admin-1", "listing-1")).resolves.toMatchObject({
      id: "listing-1",
      status: "CANCELLED",
      cancelledAt: "2026-05-21T01:00:00.000Z"
    });
    expect(moderationRequest).toEqual({ adminUserId: "admin-1", listingId: "listing-1" });
  });
});

describe("AdminService marketplace trade exports", () => {
  it("exports marketplace trade history as CSV", async () => {
    const repository = {
      ...makeRepository(),
      async findMarketplaceTradeHistory() {
        return [
          makeListing({
            cosmeticItem: {
              id: "cosmetic-1",
              name: 'Trade, Frame "Gold"',
              description: "A frame for trades.",
              slot: "AVATAR_FRAME",
              rarity: "EPIC",
              unlockLevel: 1
            }
          })
        ];
      }
    };

    const report = await new AdminService(repository).exportMarketplaceTradeHistory("admin-1", { format: "csv" });

    expect(report.contentType).toBe("text/csv; charset=utf-8");
    expect(report.filename).toMatch(/^levelupx-marketplace-trade-history-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(report.body).toContain("listingId,status,cosmeticName");
    expect(report.body).toContain('"Trade, Frame ""Gold"""');
  });

  it("exports marketplace trade history as PDF", async () => {
    const repository = {
      ...makeRepository(),
      async findMarketplaceTradeHistory() {
        return [makeListing()];
      }
    };

    const report = await new AdminService(repository).exportMarketplaceTradeHistory("admin-1", { format: "pdf" });
    const body = report.body.toString();

    expect(Buffer.isBuffer(report.body)).toBe(true);
    expect(report.contentType).toBe("application/pdf");
    expect(report.filename).toMatch(/^levelupx-marketplace-trade-history-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(body).toContain("LevelUpX Marketplace Trade History");
    expect(body).toContain("Listings exported: 1");
  });

  it("records marketplace trade export history", async () => {
    const recordedReports: { adminUserId: string; reportType: string; format: "CSV" | "PDF"; filename: string; sizeBytes: number }[] = [];
    const repository = {
      ...makeRepository(),
      async createAdminReport(report: {
        adminUserId: string;
        reportType: string;
        format: "CSV" | "PDF";
        filename: string;
        contentType: string;
        sizeBytes: number;
      }) {
        recordedReports.push(report);
        return makeAdminReport({
          adminUserId: report.adminUserId,
          reportType: report.reportType,
          format: report.format,
          filename: report.filename,
          contentType: report.contentType,
          sizeBytes: report.sizeBytes
        });
      },
      async findMarketplaceTradeHistory() {
        return [makeListing()];
      }
    };

    await new AdminService(repository).exportMarketplaceTradeHistory("admin-1", { format: "csv" });

    expect(recordedReports).toEqual([
      expect.objectContaining({
        adminUserId: "admin-1",
        reportType: "MARKETPLACE_TRADE_HISTORY",
        format: "CSV",
        filename: expect.stringMatching(/^levelupx-marketplace-trade-history-\d{4}-\d{2}-\d{2}\.csv$/),
        sizeBytes: expect.any(Number)
      })
    ]);
    expect(recordedReports[0].sizeBytes).toBeGreaterThan(0);
  });

  it("blocks admin role promotion until the target has two-step enabled", async () => {
    const repository = {
      ...makeRepository(),
      async findUserById() {
        return makeUser({ id: "user-1", role: Role.USER, twoStepEnabled: false });
      }
    };

    await expect(
      new AdminService(repository).updateUserRole("super-admin-1", "user-1", {
        role: Role.ADMIN
      })
    ).rejects.toMatchObject({
      code: "ADMIN_TWO_STEP_REQUIRED"
    });
  });

  it("blocks admin role promotion until the target email is verified", async () => {
    const repository = {
      ...makeRepository(),
      async findUserById() {
        return makeUser({
          id: "user-1",
          role: Role.USER,
          emailVerifiedAt: null,
          twoStepEnabled: true
        });
      }
    };

    await expect(
      new AdminService(repository).updateUserRole("super-admin-1", "user-1", {
        role: Role.ADMIN
      })
    ).rejects.toMatchObject({
      code: "ADMIN_EMAIL_VERIFICATION_REQUIRED"
    });
  });

  it("blocks non-super admins from changing admin account status", async () => {
    const repository = {
      ...makeRepository(),
      async findUserById(userId: string) {
        return userId === "admin-1"
          ? makeUser({ id: "admin-1", role: Role.ADMIN, twoStepEnabled: true })
          : makeUser({ id: "admin-2", role: Role.ADMIN, twoStepEnabled: true });
      }
    };

    await expect(
      new AdminService(repository).updateUserStatus("admin-1", "admin-2", {
        status: UserStatus.SUSPENDED
      })
    ).rejects.toMatchObject({
      code: "SUPER_ADMIN_REQUIRED"
    });
  });

  it("blocks role changes for the protected root super admin email", async () => {
    vi.stubEnv("ROOT_SUPER_ADMIN_EMAIL", "root@example.com");
    const repository = {
      ...makeRepository(),
      async findUserById(userId: string) {
        return userId === "root-1"
          ? makeUser({ id: "root-1", email: "root@example.com", role: Role.SUPER_ADMIN, twoStepEnabled: true })
          : makeUser({ id: "admin-1", email: "admin@example.com", role: Role.SUPER_ADMIN, twoStepEnabled: true });
      }
    };

    await expect(
      new AdminService(repository).updateUserRole("admin-1", "root-1", {
        role: Role.USER
      })
    ).rejects.toMatchObject({
      code: "ROOT_SUPER_ADMIN_IMMUTABLE"
    });
  });

  it("requires the protected root super admin to grant super admin access", async () => {
    vi.stubEnv("ROOT_SUPER_ADMIN_EMAIL", "root@example.com");
    const repository = {
      ...makeRepository(),
      async findUserById(userId: string) {
        return userId === "admin-1"
          ? makeUser({ id: "admin-1", email: "admin@example.com", role: Role.SUPER_ADMIN, twoStepEnabled: true })
          : makeUser({ id: "user-1", email: "user@example.com", role: Role.USER, twoStepEnabled: true });
      }
    };

    await expect(
      new AdminService(repository).updateUserRole("admin-1", "user-1", {
        role: Role.SUPER_ADMIN
      })
    ).rejects.toMatchObject({
      code: "ROOT_SUPER_ADMIN_REQUIRED"
    });
  });
});

describe("AdminService system health", () => {
  it("returns super-admin monitoring status and admin security controls", async () => {
    vi.stubEnv("METRICS_ENABLED", "false");
    const health = await new AdminService(makeRepository()).systemHealth();

    expect(health.service).toEqual(expect.any(String));
    expect(health.runtime.nodeVersion).toEqual(expect.stringMatching(/^v/));
    expect(health.readiness.prometheus).toBe("disabled");
    expect(health.observability).toMatchObject({
      status: "disabled",
      targetUp: null
    });
    expect(health.security).toMatchObject({
      adminTwoStepRequired: true,
      tokenDbRecheckEnabled: true,
      staleTokenInvalidationEnabled: true,
      superAdminMonitoringOnly: true
    });
  });

  it("marks the system at risk when Prometheus reports the API target down", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/levelupx");
    vi.stubEnv("METRICS_ENABLED", "true");
    vi.stubEnv("METRICS_PROVIDER", "prometheus");
    vi.stubEnv("METRICS_AUTH_TOKEN", "metrics-test-token-with-at-least-32-characters");
    const prometheus: IPrometheusMonitoringClient = {
      async snapshot() {
        return {
          status: "ready",
          message: "Prometheus is reachable, but the LevelUpX API scrape target is down.",
          targetUp: false,
          fiveMinuteRequests: 12,
          errorRatePercent: 0,
          p95LatencyMs: 35,
          requestRateHistory: [],
          activeAlerts: [],
          links: {
            prometheus: null,
            grafana: null,
            alertmanager: null
          },
          sampledAt: "2026-08-05T10:00:00.000Z"
        };
      }
    };

    const health = await new AdminService(
      makeRepository(),
      undefined,
      prometheus
    ).systemHealth();

    expect(health.status).toBe("RISK");
    expect(health.readiness.prometheus).toBe("ready");
  });
});

function makeUser(user: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "User One",
    email: "user@example.com",
    passwordHash: "hashed-password",
    emailVerifiedAt: new Date("2026-05-20T00:00:00.000Z"),
    emailVerificationCodeHash: null,
    emailVerificationExpiresAt: null,
    emailVerificationFailedAttempts: 0,
    twoStepEnabled: false,
    twoStepCodeHash: null,
    twoStepExpiresAt: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    adminWebAuthnUserId: null,
    role: Role.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    updatedAt: new Date("2026-05-20T00:00:00.000Z"),
    ...user
  };
}

function makeListing(listing: Partial<AdminMarketplaceListingWithDetails> = {}): AdminMarketplaceListingWithDetails {
  return {
    id: "listing-1",
    sellerId: "seller-1",
    buyerId: null,
    cosmeticItemId: "cosmetic-1",
    priceCoins: 120,
    status: MarketplaceListingStatus.ACTIVE,
    createdAt: new Date("2026-05-21T00:00:00.000Z"),
    soldAt: null,
    cancelledAt: null,
    seller: {
      id: "seller-1",
      name: "Seller One"
    },
    buyer: null,
    cosmeticItem: {
      id: "cosmetic-1",
      name: "Trade Frame",
      description: "A frame for trades.",
      slot: "AVATAR_FRAME",
      rarity: "EPIC",
      unlockLevel: 1
    },
    ...listing
  };
}

function makeAdminReport(report: Partial<AdminReport> = {}) {
  return {
    id: "report-1",
    adminUserId: "admin-1",
    reportType: "ADMIN_ANALYTICS",
    format: "PDF" as const,
    filename: "levelupx-admin-analytics-2026-05-21.pdf",
    contentType: "application/pdf",
    sizeBytes: 100,
    storageKey: null,
    metadata: null,
    createdAt: new Date("2026-05-21T00:00:00.000Z"),
    ...report,
    adminUser: {
      id: report.adminUserId ?? "admin-1",
      name: "Admin One"
    }
  };
}

function makeAdminAction(action: Partial<AdminAction> = {}) {
  return {
    id: "action-1",
    adminUserId: "admin-1",
    action: "ECONOMY_SETTINGS_UPDATED",
    targetType: "ECONOMY_SETTINGS",
    targetId: "settings-1",
    metadata: null,
    createdAt: new Date("2026-05-21T00:00:00.000Z"),
    ...action,
    adminUser: {
      id: action.adminUserId ?? "admin-1",
      name: "Admin One",
      email: "admin@example.com"
    }
  };
}
