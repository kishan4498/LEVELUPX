import { CoinTransactionType, Role, type EconomySettings, type User } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { getHttpRequestSnapshot } from "../../common/monitoring/metrics.js";
import {
  PrometheusMonitoringClient,
  type IPrometheusMonitoringClient
} from "../../common/monitoring/prometheusMonitoring.js";
import { resolveBackgroundJobsMode } from "../../config/backgroundJobs.js";
import { resolveMonitoringRuntimeConfig } from "../../config/monitoring.js";
import { resolveRedisRuntimeConfig } from "../../config/redis.js";
import { LocalReportFileStorage, type IReportFileStorage } from "../../jobs/reports/reportFileStorage.js";
import type {
  AbuseReportWithUser,
  AdminActionWithUser,
  AdminMarketplaceListingWithDetails,
  AdminReportWithUser,
  CoinRewardSourceRecord,
  IAdminRepository
} from "./admin.repository.js";
import type {
  AdminAbuseReportDto,
  AdminActionDto,
  AdminAnalyticsExportDto,
  AdminAnalyticsExportInput,
  AdminAnalyticsDto,
  AdminDashboardDto,
  AdminMarketplaceListingDto,
  AdminMarketplaceTradeExportDto,
  AdminMarketplaceTradeExportInput,
  AdminReportDownloadDto,
  AdminReportDto,
  AdminSystemHealthDto,
  AdminUserDto,
  EconomySettingsDto,
  UpdateAbuseReportInput,
  UpdateEconomySettingsInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput
} from "./admin.types.js";

export class AdminService {
  constructor(
    private readonly repo: IAdminRepository,
    private readonly reportStorage: IReportFileStorage = new LocalReportFileStorage(),
    private readonly prometheus: IPrometheusMonitoringClient = new PrometheusMonitoringClient()
  ) {}

  async dashboard(): Promise<AdminDashboardDto> {
    const stats = await this.repo.getDashboardStats();

    return {
      users: {
        total: stats.totalUsers,
        active: stats.activeUsers,
        banned: stats.bannedUsers,
        suspended: stats.suspendedUsers
      },
      abuseReports: {
        open: stats.openAbuseReports,
        critical: stats.criticalAbuseReports
      }
    };
  }

  async systemHealth(): Promise<AdminSystemHealthDto> {
    const monitoring = resolveMonitoringRuntimeConfig();
    const redis = resolveRedisRuntimeConfig();
    const memory = process.memoryUsage();
    const apiRequests = getHttpRequestSnapshot();
    const observability = await this.prometheus.snapshot();
    const hasCritical = observability.activeAlerts.some(
      (alert) => alert.severity.toLowerCase() === "critical"
    );
    const prometheusMisconfigured =
      observability.status === "missing-provider" || observability.status === "missing-url";
    const metricsMisconfigured = monitoring.metrics.enabled && monitoring.metrics.status !== "ready";
    const atRisk =
      !process.env.DATABASE_URL ||
      apiRequests.errorRequests > 0 ||
      metricsMisconfigured ||
      prometheusMisconfigured ||
      observability.status === "unreachable" ||
      observability.targetUp === false ||
      hasCritical;
    const needsWatching =
      apiRequests.clientErrorRequests > 3 ||
      observability.status === "degraded" ||
      observability.activeAlerts.length > 0;
    const status: AdminSystemHealthDto["status"] = atRisk ? "RISK" : needsWatching ? "WATCH" : "OK";

    return {
      service: monitoring.serviceName,
      status,
      releaseVersion: monitoring.releaseVersion ?? null,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      runtime: {
        nodeVersion: process.version,
        environment: process.env.NODE_ENV ?? "development",
        memoryRssMb: this.bytesToMb(memory.rss),
        memoryHeapUsedMb: this.bytesToMb(memory.heapUsed),
        memoryHeapTotalMb: this.bytesToMb(memory.heapTotal)
      },
      readiness: {
        database: process.env.DATABASE_URL ? "configured" : "missing-url",
        metrics: monitoring.metrics.status,
        prometheus: observability.status,
        redis: redis.status,
        backgroundJobs: resolveBackgroundJobsMode()
      },
      observability,
      apiRequests,
      security: {
        adminTwoStepRequired: true,
        tokenDbRecheckEnabled: true,
        staleTokenInvalidationEnabled: true,
        superAdminMonitoringOnly: true
      }
    };
  }

  async users(): Promise<AdminUserDto[]> {
    const users = await this.repo.findUsers();
    return users.map((user) => this.toUserDto(user));
  }

  async updateUserStatus(adminUserId: string, userId: string, change: UpdateUserStatusInput): Promise<AdminUserDto> {
    if (adminUserId === userId) {
      throw new AppError("Admins cannot change their own status", 409, "ADMIN_SELF_STATUS_CHANGE");
    }

    const [actor, target] = await Promise.all([
      this.repo.findUserById(adminUserId),
      this.repo.findUserById(userId)
    ]);

    if (!actor || !target) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    // Keep the break-glass owner reachable even if the admin panel is compromised.
    if (this.isProtectedRoot(target)) {
      throw new AppError("Root super admin cannot be changed from the admin panel", 409, "ROOT_SUPER_ADMIN_IMMUTABLE");
    }

    if ((target.role === Role.ADMIN || target.role === Role.SUPER_ADMIN) && actor.role !== Role.SUPER_ADMIN) {
      throw new AppError("Only super admins can change admin account status", 403, "SUPER_ADMIN_REQUIRED");
    }

    // A database role alone does not prove this is the configured root identity.
    if (target.role === Role.SUPER_ADMIN && !this.isProtectedRoot(actor)) {
      throw new AppError("Only the root super admin can change another super admin status", 403, "ROOT_SUPER_ADMIN_REQUIRED");
    }

    const user = await this.repo.updateUserStatus({
      adminUserId,
      userId,
      status: change.status
    });

    return this.toUserDto(user);
  }

  async updateUserRole(adminUserId: string, userId: string, change: UpdateUserRoleInput): Promise<AdminUserDto> {
    if (adminUserId === userId) {
      throw new AppError("Super admins cannot change their own role", 409, "ADMIN_SELF_ROLE_CHANGE");
    }

    const [actor, target] = await Promise.all([
      this.repo.findUserById(adminUserId),
      this.repo.findUserById(userId)
    ]);

    if (!actor || !target) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    if (this.isProtectedRoot(target)) {
      throw new AppError("Root super admin cannot be changed from the admin panel", 409, "ROOT_SUPER_ADMIN_IMMUTABLE");
    }

    // Only the immutable root can grant or remove the highest-privilege role.
    if ((change.role === Role.SUPER_ADMIN || target.role === Role.SUPER_ADMIN) && !this.isProtectedRoot(actor)) {
      throw new AppError("Only the root super admin can grant or remove super admin access", 403, "ROOT_SUPER_ADMIN_REQUIRED");
    }

    // Promotion requires both verified ownership and two-step protection.
    if ((change.role === Role.ADMIN || change.role === Role.SUPER_ADMIN) && !target.emailVerifiedAt) {
      throw new AppError("Admin role requires a verified email address", 409, "ADMIN_EMAIL_VERIFICATION_REQUIRED");
    }

    if ((change.role === Role.ADMIN || change.role === Role.SUPER_ADMIN) && !target.twoStepEnabled) {
      throw new AppError("Admin role requires two-step verification on the target account", 409, "ADMIN_TWO_STEP_REQUIRED");
    }

    const user = await this.repo.updateUserRole({
      adminUserId,
      userId,
      role: change.role
    });

    return this.toUserDto(user);
  }

  async abuseReports(): Promise<AdminAbuseReportDto[]> {
    const reports = await this.repo.findAbuseReports();
    return reports.map((report) => this.toAbuseReportDto(report));
  }

  async marketplaceListings(): Promise<AdminMarketplaceListingDto[]> {
    const listings = await this.repo.findMarketplaceListingsForModeration();
    return listings.map((listing) => this.toMarketplaceListingDto(listing));
  }

  async cancelMarketplaceListing(adminUserId: string, listingId: string): Promise<AdminMarketplaceListingDto> {
    const listing = await this.repo.cancelMarketplaceListing({ adminUserId, listingId });
    return this.toMarketplaceListingDto(listing);
  }

  async updateAbuseReport(
    adminUserId: string,
    reportId: string,
    update: UpdateAbuseReportInput
  ): Promise<AdminAbuseReportDto> {
    const report = await this.repo.updateAbuseReport({
      adminUserId,
      reportId,
      status: update.status
    });

    return this.toAbuseReportDto(report);
  }

  async economy(): Promise<EconomySettingsDto> {
    const settings = await this.repo.getEconomySettings();
    return this.toEconomySettingsDto(settings);
  }

  async updateEconomySettings(
    adminUserId: string,
    changes: UpdateEconomySettingsInput
  ): Promise<EconomySettingsDto> {
    const settings = await this.repo.updateEconomySettings({
      adminUserId,
      data: changes
    });

    return this.toEconomySettingsDto(settings);
  }

  async analytics(): Promise<AdminAnalyticsDto> {
    const analytics = await this.repo.getAdminAnalytics();

    return {
      activeUsersLast7Days: analytics.activeUsersLast7Days,
      xpGeneratedLast30Days: analytics.xpGeneratedLast30Days,
      coinInflationLast30Days: {
        earned: analytics.coinsEarnedLast30Days,
        spent: analytics.coinsSpentLast30Days,
        net: analytics.coinsEarnedLast30Days - analytics.coinsSpentLast30Days
      },
      rewardSourcesLast30Days: this.buildRewardSourceBreakdown(
        analytics.xpBySourceLast30Days,
        analytics.coinRewardSourcesLast30Days
      ),
      coinFlowByTypeLast30Days: analytics.coinFlowByTypeLast30Days.map((flow) => ({
        type: flow.type,
        amount: flow.totalCoins
      })),
      economySafeguards: this.buildEconomySafeguards({
        activeUsersLast7Days: analytics.activeUsersLast7Days,
        xpGeneratedLast30Days: analytics.xpGeneratedLast30Days,
        coinsEarnedLast30Days: analytics.coinsEarnedLast30Days,
        coinsSpentLast30Days: analytics.coinsSpentLast30Days,
        rewardCapHitCountLast30Days: analytics.rewardCapHitCountLast30Days,
        questRewardCountLast30Days: analytics.questRewardCountLast30Days,
        settings: analytics.economySettings
      }),
      abuseReports: {
        open: analytics.abuseReportsOpen,
        reviewed: analytics.abuseReportsReviewed,
        actionTaken: analytics.abuseReportsActionTaken,
        dismissed: analytics.abuseReportsDismissed
      },
      mostActiveGuilds: analytics.mostActiveGuilds
    };
  }

  async reports(): Promise<AdminReportDto[]> {
    const reports = await this.repo.findAdminReports();
    return reports.map((report) => this.toAdminReportDto(report));
  }

  async auditActions(): Promise<AdminActionDto[]> {
    const actions = await this.repo.findAdminActions();
    return actions.map((action) => this.toAdminActionDto(action));
  }

  async downloadReport(reportId: string): Promise<AdminReportDownloadDto> {
    const report = await this.repo.findAdminReportById(reportId);

    if (!report) {
      throw new AppError("Report not found", 404, "ADMIN_REPORT_NOT_FOUND");
    }

    if (!report.storageKey) {
      throw new AppError("Report file is not stored for download", 409, "ADMIN_REPORT_FILE_UNAVAILABLE");
    }

    const file = await this.reportStorage.read(report.storageKey);

    if (!file) {
      throw new AppError("Stored report file could not be found", 404, "ADMIN_REPORT_FILE_NOT_FOUND");
    }

    return {
      filename: report.filename,
      contentType: report.contentType,
      body: file.body
    };
  }

  async exportAnalytics(adminUserId: string, exportSpec: AdminAnalyticsExportInput): Promise<AdminAnalyticsExportDto> {
    const analytics = await this.analytics();
    const reportDate = new Date().toISOString().slice(0, 10);

    if (exportSpec.format === "csv") {
      const report = {
        filename: `levelupx-admin-analytics-${reportDate}.csv`,
        contentType: "text/csv; charset=utf-8",
        body: this.toAnalyticsCsv(analytics)
      };

      await this.recordAnalyticsReport(adminUserId, "CSV", report);
      return report;
    }

    if (exportSpec.format === "pdf") {
      const report = {
        filename: `levelupx-admin-analytics-${reportDate}.pdf`,
        contentType: "application/pdf",
        body: this.toAnalyticsPdf(analytics, reportDate)
      };

      await this.recordAnalyticsReport(adminUserId, "PDF", report);
      return report;
    }

    throw new AppError("Unsupported analytics export format", 400, "UNSUPPORTED_EXPORT_FORMAT");
  }

  async exportMarketplaceTradeHistory(
    adminUserId: string,
    exportSpec: AdminMarketplaceTradeExportInput
  ): Promise<AdminMarketplaceTradeExportDto> {
    const listings = await this.repo.findMarketplaceTradeHistory();
    const trades = listings.map((listing) => this.toMarketplaceListingDto(listing));
    const reportDate = new Date().toISOString().slice(0, 10);

    if (exportSpec.format === "csv") {
      const report = {
        filename: `levelupx-marketplace-trade-history-${reportDate}.csv`,
        contentType: "text/csv; charset=utf-8",
        body: this.toMarketplaceTradeCsv(trades)
      };

      await this.recordMarketplaceTradeReport(adminUserId, "CSV", report);
      return report;
    }

    if (exportSpec.format === "pdf") {
      const report = {
        filename: `levelupx-marketplace-trade-history-${reportDate}.pdf`,
        contentType: "application/pdf",
        body: this.toMarketplaceTradePdf(trades, reportDate)
      };

      await this.recordMarketplaceTradeReport(adminUserId, "PDF", report);
      return report;
    }

    throw new AppError("Unsupported marketplace trade export format", 400, "UNSUPPORTED_EXPORT_FORMAT");
  }

  private async recordAnalyticsReport(
    adminUserId: string,
    format: "CSV" | "PDF",
    report: AdminAnalyticsExportDto
  ) {
    await this.repo.createAdminReport({
      adminUserId,
      reportType: "ADMIN_ANALYTICS",
      format,
      filename: report.filename,
      contentType: report.contentType,
      sizeBytes: Buffer.byteLength(report.body),
      metadata: {
        generatedFor: "ADMIN_ANALYTICS",
        storage: "DOWNLOAD_ONLY"
      }
    });
  }

  private async recordMarketplaceTradeReport(
    adminUserId: string,
    format: "CSV" | "PDF",
    report: AdminMarketplaceTradeExportDto
  ) {
    await this.repo.createAdminReport({
      adminUserId,
      reportType: "MARKETPLACE_TRADE_HISTORY",
      format,
      filename: report.filename,
      contentType: report.contentType,
      sizeBytes: Buffer.byteLength(report.body),
      metadata: {
        generatedFor: "MARKETPLACE_TRADE_HISTORY",
        storage: "DOWNLOAD_ONLY"
      }
    });
  }

  private toAnalyticsPdf(analytics: AdminAnalyticsDto, reportDate: string) {
    const lines = this.buildAnalyticsReportLines(analytics, reportDate);
    return this.toSimplePdf("LevelUpX Admin Analytics", lines);
  }

  private toMarketplaceTradePdf(listings: AdminMarketplaceListingDto[], reportDate: string) {
    const lines = this.buildMarketplaceTradeReportLines(listings, reportDate);
    return this.toSimplePdf("LevelUpX Marketplace Trade History", lines);
  }

  private toSimplePdf(title: string, lines: string[]) {
    const contentLines = ["BT", "/F1 18 Tf", "50 760 Td", `(${this.escapePdfText(title)}) Tj`, "/F1 10 Tf", "0 -22 Td"];

    for (const line of lines) {
      for (const wrappedLine of this.wrapPdfText(line, 92)) {
        contentLines.push(`(${this.escapePdfText(wrappedLine)}) Tj`);
        contentLines.push("0 -14 Td");
      }
    }

    contentLines.push("ET");

    const content = contentLines.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
    ];

    let body = "%PDF-1.4\n";
    const offsets = [0];

    objects.forEach((pdfObject, index) => {
      offsets.push(Buffer.byteLength(body, "utf8"));
      body += `${index + 1} 0 obj\n${pdfObject}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(body, "utf8");
    body += `xref\n0 ${objects.length + 1}\n`;
    body += "0000000000 65535 f \n";
    body += offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("");
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(body, "utf8");
  }

  private buildMarketplaceTradeReportLines(listings: AdminMarketplaceListingDto[], reportDate: string) {
    return [
      `Generated: ${reportDate}`,
      `Listings exported: ${listings.length}`,
      "",
      "Marketplace listings",
      ...this.emptyFallback(
        listings.map((listing) => {
          const buyer = listing.buyerName ?? "No buyer";
          const closedAt = listing.soldAt ?? listing.cancelledAt ?? "Still active";

          return `${listing.status}: ${listing.cosmetic.name} sold by ${listing.sellerName} to ${buyer} for ${listing.priceCoins} coins. Created ${listing.createdAt}. Closed ${closedAt}.`;
        }),
        "No marketplace listing history."
      )
    ];
  }

  private buildAnalyticsReportLines(analytics: AdminAnalyticsDto, reportDate: string) {
    return [
      `Generated: ${reportDate}`,
      "",
      "Summary",
      `Active users last 7 days: ${analytics.activeUsersLast7Days}`,
      `XP generated last 30 days: ${analytics.xpGeneratedLast30Days}`,
      `Coin flow last 30 days: earned ${analytics.coinInflationLast30Days.earned}, spent ${analytics.coinInflationLast30Days.spent}, net ${analytics.coinInflationLast30Days.net}`,
      "",
      "Reward sources",
      ...this.emptyFallback(
        analytics.rewardSourcesLast30Days.map((source) => `${source.sourceType}: ${source.xp} XP, ${source.coins} coins`),
        "No reward source activity."
      ),
      "",
      "Coin flow by type",
      ...this.emptyFallback(
        analytics.coinFlowByTypeLast30Days.map((flow) => `${flow.type}: ${flow.amount}`),
        "No coin movement."
      ),
      "",
      "Economy safeguards",
      ...this.emptyFallback(
        analytics.economySafeguards.map(
          (safeguard) =>
            `${safeguard.label}: ${safeguard.level} (${safeguard.currentValue}/${safeguard.threshold}) - ${safeguard.detail} Recommendation: ${safeguard.recommendation}`
        ),
        "No safeguard signals."
      ),
      "",
      "Abuse reports",
      `Open: ${analytics.abuseReports.open}`,
      `Reviewed: ${analytics.abuseReports.reviewed}`,
      `Action taken: ${analytics.abuseReports.actionTaken}`,
      `Dismissed: ${analytics.abuseReports.dismissed}`,
      "",
      "Most active guilds",
      ...this.emptyFallback(
        analytics.mostActiveGuilds.map((guild) => `${guild.name}: ${guild.totalXp} XP, ${guild.memberCount} members`),
        "No active guilds."
      )
    ];
  }

  private emptyFallback(lines: string[], fallback: string) {
    return lines.length ? lines : [fallback];
  }

  private escapePdfText(text: string) {
    return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  }

  private wrapPdfText(text: string, limit: number) {
    if (text.length <= limit) {
      return [text];
    }

    const lines: string[] = [];
    const words = text.split(" ");
    let currentLine = "";

    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;

      if (nextLine.length > limit && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = nextLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  private toAnalyticsCsv(analytics: AdminAnalyticsDto) {
    const table: string[][] = [
      ["section", "metric", "value", "detail"],
      ["summary", "activeUsersLast7Days", String(analytics.activeUsersLast7Days), ""],
      ["summary", "xpGeneratedLast30Days", String(analytics.xpGeneratedLast30Days), ""],
      ["coinInflation", "earned", String(analytics.coinInflationLast30Days.earned), ""],
      ["coinInflation", "spent", String(analytics.coinInflationLast30Days.spent), ""],
      ["coinInflation", "net", String(analytics.coinInflationLast30Days.net), ""],
      ...analytics.rewardSourcesLast30Days.map((source) => [
        "rewardSource",
        source.sourceType,
        String(source.xp),
        `${source.coins} coins`
      ]),
      ...analytics.coinFlowByTypeLast30Days.map((flow) => [
        "coinFlow",
        flow.type,
        String(flow.amount),
        ""
      ]),
      ...analytics.economySafeguards.map((safeguard) => [
        "economySafeguard",
        safeguard.key,
        safeguard.level,
        `${safeguard.label}: ${safeguard.currentValue}/${safeguard.threshold}. ${safeguard.detail} Recommendation: ${safeguard.recommendation}`
      ]),
      ["abuseReports", "open", String(analytics.abuseReports.open), ""],
      ["abuseReports", "reviewed", String(analytics.abuseReports.reviewed), ""],
      ["abuseReports", "actionTaken", String(analytics.abuseReports.actionTaken), ""],
      ["abuseReports", "dismissed", String(analytics.abuseReports.dismissed), ""],
      ...analytics.mostActiveGuilds.map((guild) => [
        "guild",
        guild.name,
        String(guild.totalXp),
        `${guild.memberCount} members`
      ])
    ];

    return table.map((fields) => fields.map((field) => this.escapeCsvValue(field)).join(",")).join("\n");
  }

  private toMarketplaceTradeCsv(listings: AdminMarketplaceListingDto[]) {
    const table = [
      [
        "listingId",
        "status",
        "cosmeticName",
        "cosmeticRarity",
        "sellerName",
        "sellerId",
        "buyerName",
        "buyerId",
        "priceCoins",
        "createdAt",
        "soldAt",
        "cancelledAt"
      ],
      ...listings.map((listing) => [
        listing.id,
        listing.status,
        listing.cosmetic.name,
        listing.cosmetic.rarity,
        listing.sellerName,
        listing.sellerId,
        listing.buyerName ?? "",
        listing.buyerId ?? "",
        String(listing.priceCoins),
        listing.createdAt,
        listing.soldAt ?? "",
        listing.cancelledAt ?? ""
      ])
    ];

    return table.map((fields) => fields.map((field) => this.escapeCsvValue(field)).join(",")).join("\n");
  }

  private escapeCsvValue(field: string) {
    if (!/[",\n\r]/.test(field)) {
      return field;
    }

    return `"${field.replaceAll('"', '""')}"`;
  }

  private buildEconomySafeguards(metrics: {
    activeUsersLast7Days: number;
    xpGeneratedLast30Days: number;
    coinsEarnedLast30Days: number;
    coinsSpentLast30Days: number;
    rewardCapHitCountLast30Days: number;
    questRewardCountLast30Days: number;
    settings: {
      maxQuestReward: number;
      dailyCoinLimit: number;
      inflationRate: number;
    };
  }) {
    const activeUserDivisor = Math.max(1, metrics.activeUsersLast7Days);
    const xpPerActiveUser = Math.round(metrics.xpGeneratedLast30Days / activeUserDivisor);
    const xpPressureThreshold = metrics.settings.maxQuestReward * 3;
    const netCoinFlow = metrics.coinsEarnedLast30Days - metrics.coinsSpentLast30Days;
    const coinPressurePercent =
      metrics.coinsEarnedLast30Days > 0 ? Math.round((netCoinFlow / metrics.coinsEarnedLast30Days) * 100) : 0;
    const coinPressureThreshold = Math.max(10, metrics.settings.inflationRate);
    const rewardCapPressurePercent =
      metrics.questRewardCountLast30Days > 0
        ? Math.round((metrics.rewardCapHitCountLast30Days / metrics.questRewardCountLast30Days) * 100)
        : 0;

    return [
      {
        key: "XP_GENERATION",
        label: "XP generation pressure",
        level: this.safeguardLevel(xpPerActiveUser, xpPressureThreshold),
        currentValue: xpPerActiveUser,
        threshold: xpPressureThreshold,
        detail: "Average XP generated per active user over the last 30 days.",
        recommendation: this.safeguardRecommendation(
          this.safeguardLevel(xpPerActiveUser, xpPressureThreshold),
          "Review XP multiplier, max quest reward, and unusually generous quest templates before changing live settings."
        ),
        enforcementAction: this.safeguardEnforcementAction(
          this.safeguardLevel(xpPerActiveUser, xpPressureThreshold),
          "REVIEW_ECONOMY_SETTINGS",
          "Review XP economy settings"
        )
      },
      {
        key: "COIN_INFLATION",
        label: "Coin inflation pressure",
        level: this.safeguardLevel(coinPressurePercent, coinPressureThreshold),
        currentValue: coinPressurePercent,
        threshold: coinPressureThreshold,
        detail: "Net retained coin flow as a percentage of coin inflow over the last 30 days.",
        recommendation: this.safeguardRecommendation(
          this.safeguardLevel(coinPressurePercent, coinPressureThreshold),
          "Review coin multiplier, daily coin limit, and coin sinks before increasing rewards."
        ),
        enforcementAction: this.safeguardEnforcementAction(
          this.safeguardLevel(coinPressurePercent, coinPressureThreshold),
          "REDUCE_REWARD_PRESSURE",
          "Review coin reward pressure"
        )
      },
      {
        key: "REWARD_CAP_PRESSURE",
        label: "Reward cap pressure",
        level: this.safeguardLevel(rewardCapPressurePercent, 20),
        currentValue: rewardCapPressurePercent,
        threshold: 20,
        detail: "Percentage of quest XP rewards that reached the configured max quest reward cap.",
        recommendation: this.safeguardRecommendation(
          this.safeguardLevel(rewardCapPressurePercent, 20),
          "Review max quest reward and high-difficulty quest calibration before raising caps."
        ),
        enforcementAction: this.safeguardEnforcementAction(
          this.safeguardLevel(rewardCapPressurePercent, 20),
          "REVIEW_REWARD_CAP",
          "Review quest reward cap"
        )
      }
    ];
  }

  private safeguardRecommendation(level: "OK" | "WATCH" | "RISK", recommendation: string) {
    return level === "OK" ? "No enforcement action recommended." : recommendation;
  }

  private safeguardEnforcementAction(
    level: "OK" | "WATCH" | "RISK",
    type: "REVIEW_ECONOMY_SETTINGS" | "REDUCE_REWARD_PRESSURE" | "REVIEW_REWARD_CAP",
    label: string
  ) {
    if (level === "OK") {
      return {
        type: "NONE" as const,
        label: "No action needed",
        status: "NO_ACTION" as const
      };
    }

    return {
      type,
      label,
      status: "RECOMMENDED" as const
    };
  }

  private safeguardLevel(currentValue: number, threshold: number): "OK" | "WATCH" | "RISK" {
    if (currentValue >= threshold) {
      return "RISK";
    }

    if (currentValue >= Math.round(threshold * 0.75)) {
      return "WATCH";
    }

    return "OK";
  }

  private buildRewardSourceBreakdown(
    xpSources: { sourceType: string; totalXp: number }[],
    coinSources: CoinRewardSourceRecord[]
  ) {
    const sources = new Map<string, { sourceType: string; xp: number; coins: number }>();

    for (const source of xpSources) {
      sources.set(source.sourceType, {
        sourceType: source.sourceType,
        xp: source.totalXp,
        coins: 0
      });
    }

    for (const source of coinSources) {
      const sourceType = this.classifyCoinSource(source);
      const existing = sources.get(sourceType) ?? {
        sourceType,
        xp: 0,
        coins: 0
      };

      existing.coins += source.amount;
      sources.set(sourceType, existing);
    }

    return [...sources.values()].sort((left, right) => {
      const rightTotal = right.xp + right.coins;
      const leftTotal = left.xp + left.coins;

      if (rightTotal !== leftTotal) {
        return rightTotal - leftTotal;
      }

      return left.sourceType.localeCompare(right.sourceType);
    });
  }

  private classifyCoinSource(source: CoinRewardSourceRecord) {
    if (source.type === CoinTransactionType.ADMIN_ADJUSTMENT) {
      return "ADMIN_ADJUSTMENT";
    }

    if (source.reason.startsWith("Completed quest:")) {
      return "QUEST";
    }

    if (source.reason.startsWith("Unlocked achievement:")) {
      return "ACHIEVEMENT";
    }

    if (source.reason.startsWith("Completed team quest:")) {
      return "TEAM_QUEST";
    }

    return source.type;
  }

  private toUserDto(user: User): AdminUserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      twoStepEnabled: user.twoStepEnabled,
      protectedRoot: this.isProtectedRoot(user),
      createdAt: user.createdAt.toISOString()
    };
  }

  private bytesToMb(bytes: number) {
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
  }

  private isProtectedRoot(user: Pick<User, "email">) {
    const rootEmail = process.env.ROOT_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    return Boolean(rootEmail && user.email.toLowerCase() === rootEmail);
  }

  private toAbuseReportDto(report: AbuseReportWithUser): AdminAbuseReportDto {
    return {
      id: report.id,
      userId: report.userId,
      userName: report.user.name,
      reason: report.reason,
      severity: report.severity,
      status: report.status,
      metadata: report.metadata,
      createdAt: report.createdAt.toISOString()
    };
  }

  private toMarketplaceListingDto(listing: AdminMarketplaceListingWithDetails): AdminMarketplaceListingDto {
    return {
      id: listing.id,
      sellerId: listing.sellerId,
      sellerName: listing.seller.name,
      buyerId: listing.buyerId,
      buyerName: listing.buyer?.name ?? null,
      cosmetic: {
        id: listing.cosmeticItem.id,
        name: listing.cosmeticItem.name,
        description: listing.cosmeticItem.description,
        slot: listing.cosmeticItem.slot,
        rarity: listing.cosmeticItem.rarity
      },
      priceCoins: listing.priceCoins,
      status: listing.status,
      createdAt: listing.createdAt.toISOString(),
      soldAt: listing.soldAt?.toISOString() ?? null,
      cancelledAt: listing.cancelledAt?.toISOString() ?? null
    };
  }

  private toAdminReportDto(report: AdminReportWithUser): AdminReportDto {
    return {
      id: report.id,
      reportType: report.reportType,
      format: report.format,
      filename: report.filename,
      contentType: report.contentType,
      sizeBytes: report.sizeBytes,
      storageKey: report.storageKey,
      createdAt: report.createdAt.toISOString(),
      generatedBy: {
        id: report.adminUser.id,
        name: report.adminUser.name
      }
    };
  }

  private toAdminActionDto(action: AdminActionWithUser): AdminActionDto {
    return {
      id: action.id,
      action: action.action,
      targetType: action.targetType,
      targetId: action.targetId,
      metadata: action.metadata,
      createdAt: action.createdAt.toISOString(),
      actor: {
        id: action.adminUser.id,
        name: action.adminUser.name,
        email: action.adminUser.email
      }
    };
  }

  private toEconomySettingsDto(settings: EconomySettings): EconomySettingsDto {
    return {
      id: settings.id,
      xpMultiplier: settings.xpMultiplier,
      coinMultiplier: settings.coinMultiplier,
      dailyCoinLimit: settings.dailyCoinLimit,
      maxQuestReward: settings.maxQuestReward,
      inflationRate: settings.inflationRate,
      updatedBy: settings.updatedBy,
      updatedAt: settings.updatedAt.toISOString()
    };
  }
}
