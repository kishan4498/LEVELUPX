import { describe, expect, it } from "vitest";

import { resolveMonitoringRuntimeConfig } from "./monitoring.js";

describe("resolveMonitoringRuntimeConfig", () => {
  it("keeps monitoring integrations disabled by default", () => {
    expect(resolveMonitoringRuntimeConfig({})).toEqual({
      serviceName: "levelupx-api",
      releaseVersion: undefined,
      errorTracking: {
        enabled: false,
        provider: "none",
        dsn: undefined,
        status: "disabled"
      },
      metrics: {
        enabled: false,
        provider: "none",
        path: "/metrics",
        authToken: undefined,
        status: "disabled"
      }
    });
  });

  it("reports missing dsn when sentry is enabled without credentials", () => {
    expect(
      resolveMonitoringRuntimeConfig({
        ERROR_TRACKING_ENABLED: "true",
        ERROR_TRACKING_PROVIDER: "sentry",
        SERVICE_NAME: "levelupx-api"
      }).errorTracking
    ).toEqual({
      enabled: true,
      provider: "sentry",
      dsn: undefined,
      status: "missing-dsn"
    });
  });

  it("returns ready monitoring config when providers are configured", () => {
    expect(
      resolveMonitoringRuntimeConfig({
        SERVICE_NAME: "levelupx-api",
        RELEASE_VERSION: "2026.05.23",
        ERROR_TRACKING_ENABLED: "true",
        ERROR_TRACKING_PROVIDER: "sentry",
        ERROR_TRACKING_DSN: " https://example.invalid/1 ",
        METRICS_ENABLED: "true",
        METRICS_PROVIDER: "prometheus",
        METRICS_PATH: "/internal/metrics",
        METRICS_AUTH_TOKEN: "metrics-test-token-with-at-least-32-characters"
      })
    ).toEqual({
      serviceName: "levelupx-api",
      releaseVersion: "2026.05.23",
      errorTracking: {
        enabled: true,
        provider: "sentry",
        dsn: "https://example.invalid/1",
        status: "ready"
      },
      metrics: {
        enabled: true,
        provider: "prometheus",
        path: "/internal/metrics",
        authToken: "metrics-test-token-with-at-least-32-characters",
        status: "ready"
      }
    });
  });

  it("fails closed when metrics are enabled without a strong bearer token", () => {
    expect(
      resolveMonitoringRuntimeConfig({
        METRICS_ENABLED: "true",
        METRICS_PROVIDER: "prometheus",
        METRICS_AUTH_TOKEN: "too-short",
        METRICS_PATH: "not/a/route"
      }).metrics
    ).toEqual({
      enabled: true,
      provider: "prometheus",
      path: "/metrics",
      authToken: undefined,
      status: "missing-auth"
    });
  });
});
