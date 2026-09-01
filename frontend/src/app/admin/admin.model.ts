import type {
  AdminAbuseReport,
  AdminAbuseSeverity,
  AdminAbuseStatus,
  AdminAnalytics,
  AdminDashboard,
  AdminEconomySettings,
  AdminMarketplaceListing,
  AdminProductFunnel,
  AdminSystemHealth,
  AdminUser,
  AdminUserRole,
  AdminUserStatus
} from "@/types/admin";

export type AnalyticsExportFormat = "csv" | "pdf";

export const statusOptions: AdminUserStatus[] = ["ACTIVE", "SUSPENDED", "BANNED"];
export const roleOptions: AdminUserRole[] = ["USER", "ADMIN", "SUPER_ADMIN"];
export const abuseStatusOptions: AdminAbuseStatus[] = ["OPEN", "REVIEWED", "ACTION_TAKEN", "DISMISSED"];

export const emptyDashboard: AdminDashboard = {
  users: {
    total: 0,
    active: 0,
    banned: 0,
    suspended: 0
  },
  abuseReports: {
    open: 0,
    critical: 0
  }
};

export const emptyEconomySettings: AdminEconomySettings = {
  id: "",
  xpMultiplier: 1,
  coinMultiplier: 1,
  dailyCoinLimit: 500,
  maxQuestReward: 1000,
  inflationRate: 0,
  updatedBy: null,
  updatedAt: ""
};

export const emptyAnalytics: AdminAnalytics = {
  activeUsersLast7Days: 0,
  xpGeneratedLast30Days: 0,
  coinInflationLast30Days: {
    earned: 0,
    spent: 0,
    net: 0
  },
  rewardSourcesLast30Days: [],
  coinFlowByTypeLast30Days: [],
  economySafeguards: [],
  abuseReports: {
    open: 0,
    reviewed: 0,
    actionTaken: 0,
    dismissed: 0
  },
  mostActiveGuilds: []
};

export const emptySystemHealth: AdminSystemHealth = {
  service: "levelupx-api",
  status: "OK",
  releaseVersion: null,
  uptimeSeconds: 0,
  timestamp: "",
  runtime: {
    nodeVersion: "",
    environment: "development",
    memoryRssMb: 0,
    memoryHeapUsedMb: 0,
    memoryHeapTotalMb: 0
  },
  readiness: {
    database: "missing-url",
    metrics: "disabled",
    prometheus: "disabled",
    redis: "disabled",
    backgroundJobs: "manual-runner"
  },
  observability: {
    status: "disabled",
    message: "Prometheus monitoring is disabled.",
    targetUp: null,
    fiveMinuteRequests: null,
    errorRatePercent: null,
    p95LatencyMs: null,
    requestRateHistory: [],
    activeAlerts: [],
    links: {
      prometheus: null,
      grafana: null,
      alertmanager: null
    },
    sampledAt: ""
  },
  apiRequests: {
    totalRecentRequests: 0,
    errorRequests: 0,
    clientErrorRequests: 0,
    averageDurationMs: 0,
    recentRequests: []
  },
  security: {
    adminTwoStepRequired: true,
    tokenDbRecheckEnabled: true,
    staleTokenInvalidationEnabled: true,
    superAdminMonitoringOnly: true
  }
};

export const emptyProductFunnel: AdminProductFunnel = {
  from: "",
  to: "",
  steps: []
};

export function toEconomyForm(settings: AdminEconomySettings) {
  return {
    xpMultiplier: String(settings.xpMultiplier),
    coinMultiplier: String(settings.coinMultiplier),
    dailyCoinLimit: String(settings.dailyCoinLimit),
    maxQuestReward: String(settings.maxQuestReward),
    inflationRate: String(settings.inflationRate)
  };
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(date));
}

export function statusClass(status: AdminUserStatus) {
  if (status === "ACTIVE") {
    return "bg-mint/10 text-mint";
  }

  if (status === "SUSPENDED") {
    return "bg-ember/10 text-ember";
  }

  return "bg-ink/10 text-ink";
}

export function abuseStatusClass(status: AdminAbuseStatus) {
  if (status === "OPEN") {
    return "bg-ember/10 text-ember";
  }

  if (status === "ACTION_TAKEN") {
    return "bg-violet/12 text-violet";
  }

  if (status === "DISMISSED") {
    return "bg-ink/8 text-ink/55";
  }

  return "bg-mint/10 text-mint";
}

export function severityClass(severity: AdminAbuseSeverity) {
  if (severity === "CRITICAL") {
    return "bg-ink text-white";
  }

  if (severity === "HIGH") {
    return "bg-ember/12 text-ember";
  }

  if (severity === "MEDIUM") {
    return "bg-violet/12 text-violet";
  }

  return "bg-mint/10 text-mint";
}

export function marketplaceStatusClass(status: AdminMarketplaceListing["status"]) {
  if (status === "ACTIVE") {
    return "bg-mint/10 text-mint";
  }

  if (status === "SOLD") {
    return "bg-violet/12 text-violet";
  }

  return "bg-ink/8 text-ink/55";
}

export function safeguardClass(level: "OK" | "WATCH" | "RISK") {
  if (level === "RISK") {
    return "bg-ember/10 text-ember";
  }

  if (level === "WATCH") {
    return "bg-violet/12 text-violet";
  }

  return "bg-mint/10 text-mint";
}

export function observabilityClass(status: AdminSystemHealth["observability"]["status"]) {
  if (status === "ready") {
    return "bg-mint/10 text-mint";
  }

  if (status === "degraded") {
    return "bg-violet/12 text-violet";
  }

  return status === "disabled" ? "bg-ink/6 text-ink/55" : "bg-ember/10 text-ember";
}

export function labelize(label: string) {
  return label
    .toLowerCase()
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }

  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

export function summarizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "No metadata";
  }

  const fields = Object.entries(metadata)
    .slice(0, 3)
    .map(([key, entryValue]) => `${labelize(key)}: ${String(entryValue)}`);

  return fields.length > 0 ? fields.join(" / ") : "No metadata";
}

export function formatMonitoringTime(sampledAt: string) {
  const timestamp = new Date(sampledAt);

  if (!sampledAt || Number.isNaN(timestamp.getTime())) {
    return "Not sampled";
  }

  return timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDateTime(startedAt: string | null) {
  if (!startedAt) {
    return "Unknown start time";
  }

  const timestamp = new Date(startedAt);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown start time";
  }

  return timestamp.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function replaceUser(users: AdminUser[], targetUserId: string, savedUser: AdminUser) {
  return users.map((account) => (account.id === targetUserId ? savedUser : account));
}

export function replaceAbuseReport(
  reports: AdminAbuseReport[],
  targetReportId: string,
  savedReport: AdminAbuseReport
) {
  return reports.map((report) => (report.id === targetReportId ? savedReport : report));
}

export function replaceListing(
  listings: AdminMarketplaceListing[],
  targetListingId: string,
  cancelledListing: AdminMarketplaceListing
) {
  return listings.map((listing) => (
    listing.id === targetListingId ? cancelledListing : listing
  ));
}
