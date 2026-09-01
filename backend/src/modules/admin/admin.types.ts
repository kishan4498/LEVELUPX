import type { AbuseReportStatus, AbuseSeverity, CoinTransactionType, CosmeticRarity, CosmeticSlot, MarketplaceListingStatus, Role, UserStatus } from "@prisma/client";

import type { PrometheusMonitoringSnapshot } from "../../common/monitoring/prometheusMonitoring.js";

export type AdminDashboardDto = {
  users: {
    total: number;
    active: number;
    banned: number;
    suspended: number;
  };
  abuseReports: {
    open: number;
    critical: number;
  };
};

export type AdminUserDto = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: string | null;
  twoStepEnabled: boolean;
  protectedRoot: boolean;
  createdAt: string;
};

export type UpdateUserStatusInput = {
  status: UserStatus;
};

export type UpdateUserRoleInput = {
  role: Role;
};

export type AdminAbuseReportDto = {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  severity: AbuseSeverity;
  status: AbuseReportStatus;
  metadata: unknown;
  createdAt: string;
};

export type UpdateAbuseReportInput = {
  status: AbuseReportStatus;
};

export type EconomySettingsDto = {
  id: string;
  xpMultiplier: number;
  coinMultiplier: number;
  dailyCoinLimit: number;
  maxQuestReward: number;
  inflationRate: number;
  updatedBy: string | null;
  updatedAt: string;
};

export type UpdateEconomySettingsInput = {
  xpMultiplier?: number;
  coinMultiplier?: number;
  dailyCoinLimit?: number;
  maxQuestReward?: number;
  inflationRate?: number;
};

export type AdminAnalyticsDto = {
  activeUsersLast7Days: number;
  xpGeneratedLast30Days: number;
  coinInflationLast30Days: {
    earned: number;
    spent: number;
    net: number;
  };
  rewardSourcesLast30Days: {
    sourceType: string;
    xp: number;
    coins: number;
  }[];
  coinFlowByTypeLast30Days: {
    type: CoinTransactionType;
    amount: number;
  }[];
  economySafeguards: {
    key: string;
    label: string;
    level: "OK" | "WATCH" | "RISK";
    currentValue: number;
    threshold: number;
    detail: string;
    recommendation: string;
    enforcementAction: {
      type: "NONE" | "REVIEW_ECONOMY_SETTINGS" | "REDUCE_REWARD_PRESSURE" | "REVIEW_REWARD_CAP";
      label: string;
      status: "NO_ACTION" | "RECOMMENDED";
    };
  }[];
  abuseReports: {
    open: number;
    reviewed: number;
    actionTaken: number;
    dismissed: number;
  };
  mostActiveGuilds: {
    id: string;
    name: string;
    totalXp: number;
    memberCount: number;
  }[];
};

export type AdminAnalyticsExportInput = {
  format: "csv" | "pdf";
};

export type AdminAnalyticsExportDto = {
  filename: string;
  contentType: string;
  body: string | Buffer;
};

export type AdminMarketplaceTradeExportInput = AdminAnalyticsExportInput;

export type AdminMarketplaceTradeExportDto = AdminAnalyticsExportDto;

export type AdminReportDto = {
  id: string;
  reportType: string;
  format: "CSV" | "PDF";
  filename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string | null;
  createdAt: string;
  generatedBy: {
    id: string;
    name: string;
  };
};

export type AdminReportDownloadDto = {
  filename: string;
  contentType: string;
  body: Buffer;
};

export type AdminActionDto = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  };
};

export type AdminMarketplaceListingDto = {
  id: string;
  sellerId: string;
  sellerName: string;
  buyerId: string | null;
  buyerName: string | null;
  cosmetic: {
    id: string;
    name: string;
    description: string;
    slot: CosmeticSlot;
    rarity: CosmeticRarity;
  };
  priceCoins: number;
  status: MarketplaceListingStatus;
  createdAt: string;
  soldAt: string | null;
  cancelledAt: string | null;
};

export type AdminSystemHealthDto = {
  service: string;
  status: "OK" | "WATCH" | "RISK";
  releaseVersion: string | null;
  uptimeSeconds: number;
  timestamp: string;
  runtime: {
    nodeVersion: string;
    environment: string;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    memoryHeapTotalMb: number;
  };
  readiness: {
    database: "configured" | "missing-url";
    metrics: string;
    prometheus: PrometheusMonitoringSnapshot["status"];
    redis: string;
    backgroundJobs: "manual-runner" | "local-scheduler" | "hosted-scheduler";
  };
  observability: PrometheusMonitoringSnapshot;
  apiRequests: {
    totalRecentRequests: number;
    errorRequests: number;
    clientErrorRequests: number;
    averageDurationMs: number;
    recentRequests: {
      method: string;
      path: string;
      statusCode: number;
      statusClass: string;
      durationMs: number;
      recordedAt: string;
    }[];
  };
  security: {
    adminTwoStepRequired: boolean;
    tokenDbRecheckEnabled: boolean;
    staleTokenInvalidationEnabled: boolean;
    superAdminMonitoringOnly: boolean;
  };
};
