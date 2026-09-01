import { readFileSync } from "node:fs";

export type ErrorTrackingProvider = "none" | "sentry";
export type MetricsProvider = "none" | "prometheus";

export type MonitoringRuntimeConfig = {
  serviceName: string;
  releaseVersion?: string;
  errorTracking: {
    enabled: boolean;
    provider: ErrorTrackingProvider;
    dsn?: string;
    status: "disabled" | "ready" | "missing-dsn";
  };
  metrics: {
    enabled: boolean;
    provider: MetricsProvider;
    path: string;
    authToken?: string;
    status: "disabled" | "missing-provider" | "missing-auth" | "ready";
  };
};

export function resolveMonitoringRuntimeConfig(env: NodeJS.ProcessEnv = process.env): MonitoringRuntimeConfig {
  const trackingEnabled = env.ERROR_TRACKING_ENABLED === "true";
  const trackingProvider = env.ERROR_TRACKING_PROVIDER === "sentry" ? "sentry" : "none";
  const dsn = optional(env.ERROR_TRACKING_DSN);
  const metricsEnabled = env.METRICS_ENABLED === "true";
  const metricsProvider = env.METRICS_PROVIDER === "prometheus" ? "prometheus" : "none";
  const token = resolveSecret(env.METRICS_AUTH_TOKEN, env.METRICS_AUTH_TOKEN_FILE);

  return {
    serviceName: optional(env.SERVICE_NAME) ?? "levelupx-api",
    releaseVersion: optional(env.RELEASE_VERSION),
    errorTracking: {
      enabled: trackingEnabled,
      provider: trackingEnabled ? trackingProvider : "none",
      dsn,
      status: getErrorTrackingStatus({
        enabled: trackingEnabled,
        provider: trackingProvider,
        dsn
      })
    },
    metrics: {
      enabled: metricsEnabled,
      provider: metricsEnabled ? metricsProvider : "none",
      path: normalizeMetricsPath(env.METRICS_PATH),
      authToken: token,
      status: getMetricsStatus({
        enabled: metricsEnabled,
        provider: metricsProvider,
        authToken: token
      })
    }
  };
}

function getErrorTrackingStatus(tracking: { enabled: boolean; provider: ErrorTrackingProvider; dsn?: string }) {
  if (!tracking.enabled || tracking.provider === "none") {
    return "disabled";
  }

  return tracking.dsn ? "ready" : "missing-dsn";
}

function getMetricsStatus(metrics: { enabled: boolean; provider: MetricsProvider; authToken?: string }) {
  if (!metrics.enabled) {
    return "disabled";
  }

  if (metrics.provider !== "prometheus") {
    return "missing-provider";
  }

  return metrics.authToken ? "ready" : "missing-auth";
}

function normalizeMetricsPath(rawPath: string | undefined) {
  const normalized = optional(rawPath) ?? "/metrics";
  return /^\/[A-Za-z0-9/_-]*$/.test(normalized) && !normalized.includes("//") ? normalized : "/metrics";
}

function resolveSecret(inlineSecret: string | undefined, filePath: string | undefined) {
  const direct = optional(inlineSecret);

  if (direct && direct.length >= 32) {
    return direct;
  }

  const path = optional(filePath);

  if (!path) {
    return undefined;
  }

  try {
    const secret = readFileSync(path, "utf8").trim();
    return secret.length >= 32 ? secret : undefined;
  } catch {
    return undefined;
  }
}

function optional(raw: string | undefined) {
  return raw?.trim() || undefined;
}
