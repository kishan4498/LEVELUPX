import { describe, expect, it } from "vitest";

import { recordHttpRequest, recordUnhandledError, renderPrometheusMetrics } from "./metrics.js";

describe("monitoring metrics", () => {
  it("records request and unhandled error metrics", async () => {
    recordHttpRequest({
      method: "get",
      path: "/api/users/123456789?tab=profile",
      statusCode: 500,
      durationMs: 125
    });
    recordUnhandledError({
      errorName: "Error",
      path: "/api/users/123456789?tab=profile"
    });

    const metricsText = await renderPrometheusMetrics({
      serviceName: "levelupx-api",
      releaseVersion: "test-release"
    });

    expect(metricsText).toContain('levelupx_http_requests_total{method="GET",path="/api/users/:id",status_code="500",status_class="5xx"}');
    expect(metricsText).toContain('levelupx_unhandled_errors_total{error_name="Error",path="/api/users/:id"}');
    expect(metricsText).toContain('levelupx_build_info{service="levelupx-api",release="test-release"} 1');
  });
});
