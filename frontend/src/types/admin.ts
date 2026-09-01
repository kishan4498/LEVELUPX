export type AdminDashboard = {
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

export type AdminUserStatus = "ACTIVE" | "BANNED" | "SUSPENDED";
export type AdminUserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  emailVerifiedAt: string | null;
  twoStepEnabled: boolean;
  protectedRoot: boolean;
  createdAt: string;
};

export type AdminAbuseSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AdminAbuseStatus = "OPEN" | "REVIEWED" | "ACTION_TAKEN" | "DISMISSED";

export type AdminAbuseReport = {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  severity: AdminAbuseSeverity;
  status: AdminAbuseStatus;
  metadata: unknown;
  createdAt: string;
};

export type AdminEconomySettings = {
  id: string;
  xpMultiplier: number;
  coinMultiplier: number;
  dailyCoinLimit: number;
  maxQuestReward: number;
  inflationRate: number;
  updatedBy: string | null;
  updatedAt: string;
};

export type AdminAnalytics = {
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
    type: "EARNED" | "SPENT" | "ADMIN_ADJUSTMENT" | "PENALTY" | "BONUS";
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

export type AdminReport = {
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

export type AdminAction = {
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

export type AdminMarketplaceListing = {
  id: string;
  sellerId: string;
  sellerName: string;
  buyerId: string | null;
  buyerName: string | null;
  cosmetic: {
    id: string;
    name: string;
    description: string;
    slot: "AVATAR_FRAME" | "PROFILE_BADGE";
    rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
  };
  priceCoins: number;
  status: "ACTIVE" | "SOLD" | "CANCELLED";
  createdAt: string;
  soldAt: string | null;
  cancelledAt: string | null;
};

export type AdminSystemHealth = {
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
    prometheus:
      | "disabled"
      | "missing-provider"
      | "missing-url"
      | "ready"
      | "degraded"
      | "unreachable";
    redis: string;
    backgroundJobs: "manual-runner" | "local-scheduler" | "hosted-scheduler";
  };
  observability: {
    status:
      | "disabled"
      | "missing-provider"
      | "missing-url"
      | "ready"
      | "degraded"
      | "unreachable";
    message: string | null;
    targetUp: boolean | null;
    fiveMinuteRequests: number | null;
    errorRatePercent: number | null;
    p95LatencyMs: number | null;
    requestRateHistory: {
      timestamp: string;
      requestsPerMinute: number;
    }[];
    activeAlerts: {
      name: string;
      severity: string;
      summary: string;
      description: string;
      state: string;
      activeAt: string | null;
    }[];
    links: {
      prometheus: string | null;
      grafana: string | null;
      alertmanager: string | null;
    };
    sampledAt: string;
  };
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

export type AdminProductFunnel = {
  from: string;
  to: string;
  steps: {
    name:
      | "onboarding_started"
      | "onboarding_completed"
      | "quest_created"
      | "quest_completed"
      | "focus_completed";
    events: number;
    uniqueUsers: number;
    conversionFromPrevious: number | null;
  }[];
};
