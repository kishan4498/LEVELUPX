import { describe, expect, it, vi } from "vitest";

import type { ObservabilityRuntimeConfig } from "../../config/observability.js";
import { PrometheusMonitoringClient } from "./prometheusMonitoring.js";

const monitoring: ObservabilityRuntimeConfig = {
  status: "ready",
  prometheusUrl: "http://prometheus:9090",
  queryTimeoutMs: 1_000,
  links: {
    prometheus: "http://localhost:9090",
    grafana: "http://localhost:3001/d/levelupx-overview",
    alertmanager: "http://localhost:9093"
  }
};

describe("PrometheusMonitoringClient", () => {
  it("does not make network requests while monitoring is disabled", async () => {
    const fetchMock = vi.fn();
    const client = new PrometheusMonitoringClient(
      () => ({
        ...monitoring,
        status: "disabled",
        prometheusUrl: undefined
      }),
      fetchMock
    );

    await expect(client.snapshot()).resolves.toMatchObject({
      status: "disabled",
      targetUp: null,
      requestRateHistory: []
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses current metrics, history, and active alerts", async () => {
    const now = Date.parse("2026-08-05T10:00:00.000Z");
    const fetchMock = vi.fn(async (target: string | URL) => {
      const url = new URL(String(target));

      if (url.pathname.endsWith("/api/v1/query_range")) {
        return jsonResponse({
          status: "success",
          data: {
            resultType: "matrix",
            result: [
              {
                metric: {},
                values: [
                  [now / 1_000 - 300, "10.125"],
                  [now / 1_000, "12.5"]
                ]
              }
            ]
          }
        });
      }

      if (url.pathname.endsWith("/api/v1/alerts")) {
        return jsonResponse({
          status: "success",
          data: {
            alerts: [
              {
                labels: {
                  alertname: "LevelUpXHighApiLatency",
                  severity: "warning"
                },
                annotations: {
                  summary: "API latency is elevated",
                  description: "Inspect slow routes."
                },
                state: "firing",
                activeAt: "2026-08-05T09:58:00.000Z"
              }
            ]
          }
        });
      }

      const metric = metricValue(url.searchParams.get("query"));

      return jsonResponse({
        status: "success",
        data: {
          resultType: "vector",
          result: [{ metric: {}, value: [now / 1_000, metric] }]
        }
      });
    });
    const client = new PrometheusMonitoringClient(() => monitoring, fetchMock, () => now);

    await expect(client.snapshot()).resolves.toEqual({
      status: "ready",
      message: null,
      targetUp: true,
      fiveMinuteRequests: 42,
      errorRatePercent: 2.5,
      p95LatencyMs: 180.3,
      requestRateHistory: [
        {
          timestamp: "2026-08-05T09:55:00.000Z",
          requestsPerMinute: 10.13
        },
        {
          timestamp: "2026-08-05T10:00:00.000Z",
          requestsPerMinute: 12.5
        }
      ],
      activeAlerts: [
        {
          name: "LevelUpXHighApiLatency",
          severity: "warning",
          summary: "API latency is elevated",
          description: "Inspect slow routes.",
          state: "firing",
          activeAt: "2026-08-05T09:58:00.000Z"
        }
      ],
      links: monitoring.links,
      sampledAt: "2026-08-05T10:00:00.000Z"
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("returns an unreachable snapshot when the primary query fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const client = new PrometheusMonitoringClient(() => monitoring, fetchMock);

    await expect(client.snapshot()).resolves.toMatchObject({
      status: "unreachable",
      targetUp: null,
      activeAlerts: []
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function metricValue(query: string | null) {
  if (query === 'max(up{job="levelupx-backend"})') return "1";
  if (query?.includes("increase")) return "42.4";
  if (query?.includes("ratio5m")) return "2.5";
  return "180.25";
}
