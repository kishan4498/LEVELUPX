export type ObservabilityRuntimeStatus = "disabled" | "missing-provider" | "missing-url" | "ready";

export type ObservabilityRuntimeConfig = {
  status: ObservabilityRuntimeStatus;
  prometheusUrl?: string;
  queryTimeoutMs: number;
  links: {
    prometheus: string | null;
    grafana: string | null;
    alertmanager: string | null;
  };
};

export function resolveObservabilityRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): ObservabilityRuntimeConfig {
  const enabled = env.METRICS_ENABLED === "true";
  const selected = env.METRICS_PROVIDER === "prometheus";
  const url = httpUrl(env.PROMETHEUS_URL);

  return {
    status: runtimeStatus(enabled, selected, url),
    prometheusUrl: url,
    queryTimeoutMs: timeout(env.OBSERVABILITY_QUERY_TIMEOUT_MS),
    links: {
      prometheus: httpUrl(env.PROMETHEUS_PUBLIC_URL) ?? null,
      grafana: httpUrl(env.GRAFANA_PUBLIC_URL) ?? null,
      alertmanager: httpUrl(env.ALERTMANAGER_PUBLIC_URL) ?? null
    }
  };
}

function runtimeStatus(enabled: boolean, selected: boolean, url: string | undefined): ObservabilityRuntimeStatus {
  if (!enabled) return "disabled";
  if (!selected) return "missing-provider";
  return url ? "ready" : "missing-url";
}

function httpUrl(rawUrl: string | undefined) {
  const candidate = rawUrl?.trim();

  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function timeout(rawTimeout: string | undefined) {
  const parsed = Number(rawTimeout);

  if (!Number.isFinite(parsed)) {
    return 3_000;
  }

  return Math.min(10_000, Math.max(500, Math.trunc(parsed)));
}
