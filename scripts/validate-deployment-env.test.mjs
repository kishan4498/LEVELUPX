import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const VALIDATOR = fileURLToPath(new URL("./validate-deployment-env.mjs", import.meta.url));

const VALID_BACKEND_ENV = {
  NODE_ENV: "production",
  PORT: "4000",
  DATABASE_URL: "postgresql://levelupx:password@database.example.com:5432/levelupx",
  JWT_ACCESS_SECRET: "2GqA3xMxv89LwUTVrE6CzfQND7YJ4KpB",
  JWT_REFRESH_SECRET: "9VzTe5hXQ2Pws8MjRCn7LkF4aY6uD3Gb",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_MAX_REQUESTS: "100",
  AUTH_RATE_LIMIT_WINDOW_MS: "60000",
  AUTH_RATE_LIMIT_MAX_REQUESTS: "10",
  CORS_ALLOWED_ORIGINS: "https://app.example.com",
  WEBAUTHN_RP_ID: "example.com",
  WEBAUTHN_ORIGIN: "https://app.example.com",
  WEBAUTHN_RP_NAME: "LevelUpX",
  ROOT_SUPER_ADMIN_EMAIL: "owner@example.com",
  LOG_LEVEL: "info",
  REPORT_STORAGE_DIR: "./reports",
  AUTH_EMAIL_DELIVERY_ENABLED: "false",
  AUTH_EMAIL_PROVIDER: "none",
  AUTH_EMAIL_TIMEOUT_MS: "5000",
  AUTH_EMAIL_PRINT_CODES_TO_CONSOLE: "false",
  AUTH_DEV_DISCLOSE_CODES: "false",
  WEEKLY_REPORT_DELIVERY_ENABLED: "false",
  WEEKLY_REPORT_DELIVERY_PROVIDER: "none",
  WEEKLY_REPORT_EMAIL_PROVIDER: "none",
  AI_INSIGHT_PROVIDER: "prepared",
  AI_INSIGHT_TIMEOUT_MS: "5000",
  AI_INSIGHT_PROMPT_VERSION: "v1",
  AI_INSIGHT_PROMPT_AUDIENCE: "student",
  AI_INSIGHT_MAX_INSIGHTS: "3",
  BACKGROUND_JOBS_MODE: "hosted",
  PUSH_DELIVERY_PROVIDER: "prepared",
  REDIS_ENABLED: "false",
  REDIS_NAMESPACE: "levelupx",
  REDIS_PURPOSES: "none",
  SERVICE_NAME: "levelupx-api",
  RELEASE_VERSION: "test-release",
  ERROR_TRACKING_ENABLED: "false",
  ERROR_TRACKING_PROVIDER: "none",
  METRICS_ENABLED: "true",
  METRICS_PROVIDER: "prometheus",
  METRICS_PATH: "/metrics",
  METRICS_AUTH_TOKEN: "4rJ8mQ2zT7vN5xC9pK3sW6yH1dF8aL0u",
  METRICS_AUTH_TOKEN_FILE: "",
  PROMETHEUS_URL: "http://prometheus.internal:9090"
};

test("accepts a protected Prometheus deployment", () => {
  const result = runValidator();

  assert.equal(result.status, 0);
  assert.equal(result.output.ok, true);
});

test("requires a scrape credential when metrics are enabled", () => {
  const result = runValidator({
    METRICS_AUTH_TOKEN: "",
    METRICS_AUTH_TOKEN_FILE: ""
  });

  assert.equal(result.status, 1);
  assert.ok(result.output.missing.includes("METRICS_AUTH_TOKEN or METRICS_AUTH_TOKEN_FILE"));
});

test("rejects a weak direct scrape token", () => {
  const result = runValidator({ METRICS_AUTH_TOKEN: "too-short" });

  assert.equal(result.status, 1);
  assert.ok(result.output.invalid.includes("METRICS_AUTH_TOKEN must be at least 32 characters"));
});

test("requires a valid Prometheus provider, URL, and route", () => {
  const result = runValidator({
    METRICS_PROVIDER: "none",
    METRICS_PATH: "metrics//private",
    PROMETHEUS_URL: "file:///prometheus"
  });

  assert.equal(result.status, 1);
  assert.ok(result.output.invalid.includes("METRICS_PROVIDER must be prometheus when metrics are enabled"));
  assert.ok(result.output.invalid.includes("METRICS_PATH must be a valid absolute route path"));
  assert.ok(result.output.invalid.includes("PROMETHEUS_URL must be a valid HTTP(S) URL"));
});

function runValidator(overrides = {}) {
  const result = spawnSync(process.execPath, [VALIDATOR, "--mode", "backend"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...VALID_BACKEND_ENV,
      ...overrides
    }
  });

  assert.equal(result.error, undefined);

  const raw = result.status === 0 ? result.stdout : result.stderr;
  return {
    status: result.status,
    output: JSON.parse(raw)
  };
}
