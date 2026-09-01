import { z } from "zod";

import {
  resolveObservabilityRuntimeConfig,
  type ObservabilityRuntimeConfig
} from "../../config/observability.js";

const TARGET_UP_QUERY = 'max(up{job="levelupx-backend"})';
const FIVE_MINUTE_REQUESTS_QUERY = "sum(increase(levelupx_http_requests_total[5m]))";
const ERROR_RATE_QUERY = "levelupx:http_errors:ratio5m * 100";
const P95_LATENCY_QUERY = "levelupx:http_request_duration:p95_5m_seconds * 1000";
const REQUEST_RATE_QUERY = "levelupx:http_requests:rate5m * 60";

const metricLabelsSchema = z.record(z.string());
const sampleSchema = z.tuple([z.number(), z.string()]);

const vectorSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.literal("vector"),
    result: z.array(
      z.object({
        metric: metricLabelsSchema,
        value: sampleSchema
      })
    )
  })
});

const matrixSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.literal("matrix"),
    result: z.array(
      z.object({
        metric: metricLabelsSchema,
        values: z.array(sampleSchema)
      })
    )
  })
});

const alertFeedSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    alerts: z.array(
      z.object({
        labels: metricLabelsSchema,
        annotations: metricLabelsSchema.optional().default({}),
        state: z.string(),
        activeAt: z.string().optional()
      })
    )
  })
});

export type PrometheusMonitoringAlert = {
  name: string;
  severity: string;
  summary: string;
  description: string;
  state: string;
  activeAt: string | null;
};

export type PrometheusMonitoringSnapshot = {
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
  activeAlerts: PrometheusMonitoringAlert[];
  links: ObservabilityRuntimeConfig["links"];
  sampledAt: string;
};

export interface IPrometheusMonitoringClient {
  snapshot(): Promise<PrometheusMonitoringSnapshot>;
}

type FetchLike = (target: string | URL, init?: RequestInit) => Promise<Response>;

export class PrometheusMonitoringClient implements IPrometheusMonitoringClient {
  constructor(
    private readonly loadMonitoring: () => ObservabilityRuntimeConfig = resolveObservabilityRuntimeConfig,
    private readonly fetch: FetchLike = globalThis.fetch,
    private readonly now: () => number = Date.now
  ) {}

  async snapshot(): Promise<PrometheusMonitoringSnapshot> {
    const monitoring = this.loadMonitoring();

    if (monitoring.status !== "ready" || !monitoring.prometheusUrl) {
      return this.empty(
        monitoring,
        monitoring.status,
        monitoring.status === "disabled"
          ? "Prometheus monitoring is disabled."
          : "Prometheus monitoring is not fully configured."
      );
    }

    let target: number | null;

    try {
      target = await this.instantQuery(monitoring, TARGET_UP_QUERY);
    } catch {
      return this.empty(
        monitoring,
        "unreachable",
        "Prometheus could not be reached before the query timeout."
      );
    }

    const end = Math.floor(this.now() / 1_000);
    const queries = await Promise.allSettled([
      this.instantQuery(monitoring, FIVE_MINUTE_REQUESTS_QUERY),
      this.instantQuery(monitoring, ERROR_RATE_QUERY),
      this.instantQuery(monitoring, P95_LATENCY_QUERY),
      this.rangeQuery(monitoring, REQUEST_RATE_QUERY, end - 3_600, end, 300),
      this.activeAlerts(monitoring)
    ]);
    const partial = queries.some((query) => query.status === "rejected");
    const requests5m = settled(queries[0]);
    const errorRate = settled(queries[1]);
    const p95 = settled(queries[2]);
    const history = settled(queries[3]) ?? [];
    const alerts = settled(queries[4]) ?? [];
    const targetUp = target === null ? null : target > 0;
    const degraded = target === null || partial;
    let message = null;

    if (targetUp === false) {
      message = "Prometheus is reachable, but the LevelUpX API scrape target is down.";
    } else if (degraded) {
      message = "Prometheus returned only part of the monitoring snapshot.";
    }

    return {
      status: degraded ? "degraded" : "ready",
      message,
      targetUp,
      fiveMinuteRequests: round(requests5m, 0),
      errorRatePercent: round(errorRate, 2),
      p95LatencyMs: round(p95, 1),
      requestRateHistory: history,
      activeAlerts: alerts,
      links: monitoring.links,
      sampledAt: new Date(this.now()).toISOString()
    };
  }

  private async instantQuery(monitoring: ObservabilityRuntimeConfig, query: string) {
    const vector = vectorSchema.parse(
      await this.getJson(monitoring, "api/v1/query", {
        query
      })
    );

    return toNumber(vector.data.result[0]?.value[1]);
  }

  private async rangeQuery(
    monitoring: ObservabilityRuntimeConfig,
    query: string,
    start: number,
    end: number,
    step: number
  ) {
    const matrix = matrixSchema.parse(
      await this.getJson(monitoring, "api/v1/query_range", {
        query,
        start: String(start),
        end: String(end),
        step: String(step)
      })
    );
    const samples = matrix.data.result[0]?.values ?? [];
    const history: PrometheusMonitoringSnapshot["requestRateHistory"] = [];

    for (const [timestamp, raw] of samples) {
      const rate = toNumber(raw);

      if (rate !== null) {
        history.push({
          timestamp: new Date(timestamp * 1_000).toISOString(),
          requestsPerMinute: round(rate, 2) ?? 0
        });
      }
    }

    return history;
  }

  private async activeAlerts(monitoring: ObservabilityRuntimeConfig) {
    const alertFeed = alertFeedSchema.parse(await this.getJson(monitoring, "api/v1/alerts"));

    return alertFeed.data.alerts.map((alert): PrometheusMonitoringAlert => ({
      name: alert.labels.alertname ?? "Unnamed alert",
      severity: alert.labels.severity ?? "unknown",
      summary: alert.annotations.summary ?? "No summary provided",
      description: alert.annotations.description ?? "",
      state: alert.state,
      activeAt: alert.activeAt ?? null
    }));
  }

  private async getJson(
    monitoring: ObservabilityRuntimeConfig,
    path: string,
    query: Record<string, string> = {}
  ) {
    const url = new URL(`${monitoring.prometheusUrl}/${path}`);

    for (const [key, queryText] of Object.entries(query)) {
      url.searchParams.set(key, queryText);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), monitoring.queryTimeoutMs);

    try {
      const res = await this.fetch(url, {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Prometheus returned HTTP ${res.status}`);
      }

      // Keep the abort timeout active until the response body has been read.
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private empty(
    monitoring: ObservabilityRuntimeConfig,
    status: PrometheusMonitoringSnapshot["status"],
    message: string
  ): PrometheusMonitoringSnapshot {
    return {
      status,
      message,
      targetUp: null,
      fiveMinuteRequests: null,
      errorRatePercent: null,
      p95LatencyMs: null,
      requestRateHistory: [],
      activeAlerts: [],
      links: monitoring.links,
      sampledAt: new Date(this.now()).toISOString()
    };
  }
}

function toNumber(raw: string | undefined) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(amount: number | null, digits: number) {
  if (amount === null) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(amount * factor) / factor;
}

function settled<T>(query: PromiseSettledResult<T>): T | null {
  return query.status === "fulfilled" ? query.value : null;
}
