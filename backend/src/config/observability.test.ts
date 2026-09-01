import { describe, expect, it } from "vitest";

import { resolveObservabilityRuntimeConfig } from "./observability.js";

describe("resolveObservabilityRuntimeConfig", () => {
  it("keeps historical monitoring disabled with metrics", () => {
    expect(resolveObservabilityRuntimeConfig({})).toEqual({
      status: "disabled",
      prometheusUrl: undefined,
      queryTimeoutMs: 3_000,
      links: {
        prometheus: null,
        grafana: null,
        alertmanager: null
      }
    });
  });

  it("reports incomplete Prometheus configuration without accepting unsafe links", () => {
    expect(
      resolveObservabilityRuntimeConfig({
        METRICS_ENABLED: "true",
        METRICS_PROVIDER: "prometheus",
        PROMETHEUS_URL: "file:///tmp/prometheus",
        GRAFANA_PUBLIC_URL: "javascript:alert(1)"
      })
    ).toMatchObject({
      status: "missing-url",
      prometheusUrl: undefined,
      links: {
        grafana: null
      }
    });
  });

  it("normalizes a ready local stack and bounds its query timeout", () => {
    expect(
      resolveObservabilityRuntimeConfig({
        METRICS_ENABLED: "true",
        METRICS_PROVIDER: "prometheus",
        PROMETHEUS_URL: " http://prometheus:9090/ ",
        PROMETHEUS_PUBLIC_URL: "http://localhost:9090/",
        GRAFANA_PUBLIC_URL: "http://localhost:3001/d/levelupx-overview/",
        ALERTMANAGER_PUBLIC_URL: "http://localhost:9093/",
        OBSERVABILITY_QUERY_TIMEOUT_MS: "25000"
      })
    ).toEqual({
      status: "ready",
      prometheusUrl: "http://prometheus:9090",
      queryTimeoutMs: 10_000,
      links: {
        prometheus: "http://localhost:9090",
        grafana: "http://localhost:3001/d/levelupx-overview",
        alertmanager: "http://localhost:9093"
      }
    });
  });
});
