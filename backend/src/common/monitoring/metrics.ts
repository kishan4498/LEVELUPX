import client from "prom-client";

const registry = new client.Registry();

client.collectDefaultMetrics({
  register: registry,
  prefix: "levelupx_"
});

const httpRequestCounter = new client.Counter({
  name: "levelupx_http_requests_total",
  help: "Total HTTP requests handled by the API.",
  labelNames: ["method", "path", "status_code", "status_class"] as const,
  registers: [registry]
});

const httpRequestDuration = new client.Histogram({
  name: "levelupx_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "path", "status_class"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry]
});

const errorCounter = new client.Counter({
  name: "levelupx_unhandled_errors_total",
  help: "Unhandled backend errors captured by the Express error handler.",
  labelNames: ["error_name", "path"] as const,
  registers: [registry]
});

const buildInfo = new client.Gauge({
  name: "levelupx_build_info",
  help: "Build and service metadata for the running API process.",
  labelNames: ["service", "release"] as const,
  registers: [registry]
});

const recent: {
  method: string;
  path: string;
  statusCode: number;
  statusClass: string;
  durationMs: number;
  recordedAt: string;
}[] = [];

export function recordHttpRequest(request: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}) {
  const labels = {
    method: request.method.toUpperCase(),
    path: normalizePath(request.path),
    status_code: String(request.statusCode),
    status_class: `${Math.floor(request.statusCode / 100)}xx`
  };

  httpRequestCounter.inc(labels);
  httpRequestDuration.observe(
    {
      method: labels.method,
      path: labels.path,
      status_class: labels.status_class
    },
    request.durationMs / 1000
  );

  // Keep a small readable window for the admin UI; Prometheus owns long-term data.
  recent.unshift({
    method: labels.method,
    path: labels.path,
    statusCode: request.statusCode,
    statusClass: labels.status_class,
    durationMs: Math.round(request.durationMs),
    recordedAt: new Date().toISOString()
  });

  recent.splice(50);
}

export function recordUnhandledError(event: { errorName: string; path: string }) {
  errorCounter.inc({
    error_name: event.errorName,
    path: normalizePath(event.path)
  });
}

export async function renderPrometheusMetrics(build: { serviceName: string; releaseVersion?: string }) {
  buildInfo.set(
    {
      service: build.serviceName,
      release: build.releaseVersion ?? "unknown"
    },
    1
  );

  return registry.metrics();
}

export function prometheusContentType() {
  return registry.contentType;
}

export function getHttpRequestSnapshot() {
  const total = recent.length;
  const serverErrors = recent.filter((request) => request.statusCode >= 500).length;
  const clientErrors = recent.filter((request) => request.statusCode >= 400 && request.statusCode < 500).length;
  const avgDurationMs =
    total === 0
      ? 0
      : Math.round(recent.reduce((sum, request) => sum + request.durationMs, 0) / total);

  return {
    totalRecentRequests: total,
    errorRequests: serverErrors,
    clientErrorRequests: clientErrors,
    averageDurationMs: avgDurationMs,
    recentRequests: recent.slice(0, 10)
  };
}

function normalizePath(rawPath: string) {
  const path = rawPath.split("?")[0] || "/";

  // Collapse dynamic IDs to keep metric labels low-cardinality.
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id")
    .replace(/\b\d{6,}\b/g, ":id");
}
