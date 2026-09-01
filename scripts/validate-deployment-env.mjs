#!/usr/bin/env node

const BACKEND_REQUIRED = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "RATE_LIMIT_WINDOW_MS",
  "RATE_LIMIT_MAX_REQUESTS",
  "AUTH_RATE_LIMIT_WINDOW_MS",
  "AUTH_RATE_LIMIT_MAX_REQUESTS",
  "CORS_ALLOWED_ORIGINS",
  "WEBAUTHN_RP_ID",
  "WEBAUTHN_ORIGIN",
  "WEBAUTHN_RP_NAME",
  "ROOT_SUPER_ADMIN_EMAIL",
  "LOG_LEVEL",
  "REPORT_STORAGE_DIR",
  "AUTH_EMAIL_DELIVERY_ENABLED",
  "AUTH_EMAIL_PROVIDER",
  "AUTH_EMAIL_TIMEOUT_MS",
  "AUTH_EMAIL_PRINT_CODES_TO_CONSOLE",
  "AUTH_DEV_DISCLOSE_CODES",
  "WEEKLY_REPORT_DELIVERY_ENABLED",
  "WEEKLY_REPORT_DELIVERY_PROVIDER",
  "WEEKLY_REPORT_EMAIL_PROVIDER",
  "AI_INSIGHT_PROVIDER",
  "AI_INSIGHT_TIMEOUT_MS",
  "AI_INSIGHT_PROMPT_VERSION",
  "AI_INSIGHT_PROMPT_AUDIENCE",
  "AI_INSIGHT_MAX_INSIGHTS",
  "BACKGROUND_JOBS_MODE",
  "PUSH_DELIVERY_PROVIDER",
  "REDIS_ENABLED",
  "REDIS_NAMESPACE",
  "REDIS_PURPOSES",
  "SERVICE_NAME",
  "RELEASE_VERSION",
  "ERROR_TRACKING_ENABLED",
  "ERROR_TRACKING_PROVIDER",
  "METRICS_ENABLED",
  "METRICS_PROVIDER",
  "METRICS_PATH"
];

const FRONTEND_REQUIRED = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_REALTIME_URL"
];

const OPTIONAL_RULES = [
  {
    when: () => process.env.AUTH_EMAIL_DELIVERY_ENABLED === "true",
    names: ["AUTH_EMAIL_FROM"]
  },
  {
    when: () => process.env.AUTH_EMAIL_DELIVERY_ENABLED === "true" && process.env.AUTH_EMAIL_PROVIDER === "smtp",
    names: ["AUTH_EMAIL_SMTP_HOST", "AUTH_EMAIL_SMTP_PORT", "AUTH_EMAIL_SMTP_USERNAME", "AUTH_EMAIL_SMTP_PASSWORD"]
  },
  {
    when: () => process.env.AUTH_EMAIL_DELIVERY_ENABLED === "true" && process.env.AUTH_EMAIL_PROVIDER === "api",
    names: ["AUTH_EMAIL_API_ENDPOINT", "AUTH_EMAIL_API_KEY"]
  },
  {
    when: () => process.env.AUTH_EMAIL_DELIVERY_ENABLED === "true" && process.env.AUTH_EMAIL_PROVIDER === "local-outbox",
    names: ["AUTH_EMAIL_OUTBOX_DIR"]
  },
  {
    when: () => process.env.REDIS_ENABLED === "true",
    names: ["REDIS_URL"]
  },
  {
    when: () => process.env.ERROR_TRACKING_ENABLED === "true",
    names: ["ERROR_TRACKING_DSN"]
  },
  {
    when: () => process.env.PUSH_DELIVERY_PROVIDER === "web-push",
    names: ["PUSH_VAPID_PUBLIC_KEY", "PUSH_VAPID_PRIVATE_KEY", "PUSH_VAPID_SUBJECT", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"]
  },
  {
    when: () => process.env.AI_INSIGHT_PROVIDER === "external-http",
    names: ["AI_INSIGHT_ENDPOINT"]
  },
  {
    when: () => process.env.WEEKLY_REPORT_DELIVERY_ENABLED === "true",
    names: ["WEEKLY_REPORT_RECIPIENT_EMAILS", "WEEKLY_REPORT_EMAIL_FROM"]
  },
  {
    when: () => process.env.WEEKLY_REPORT_DELIVERY_ENABLED === "true" && process.env.WEEKLY_REPORT_EMAIL_PROVIDER === "smtp",
    names: ["WEEKLY_REPORT_SMTP_HOST", "WEEKLY_REPORT_SMTP_PORT", "WEEKLY_REPORT_SMTP_USERNAME", "WEEKLY_REPORT_SMTP_PASSWORD"]
  },
  {
    when: () => process.env.WEEKLY_REPORT_DELIVERY_ENABLED === "true" && process.env.WEEKLY_REPORT_EMAIL_PROVIDER === "api",
    names: ["WEEKLY_REPORT_API_ENDPOINT", "WEEKLY_REPORT_API_KEY"]
  },
  {
    when: () => process.env.ENABLE_DEPLOY_HOOKS === "true",
    names: ["BACKEND_DEPLOY_HOOK_URL", "FRONTEND_DEPLOY_HOOK_URL"]
  }
];

const mode = readArg("--mode") ?? "all";
const checkBackend = mode === "all" || mode === "backend";
const required = new Set();

if (checkBackend) {
  BACKEND_REQUIRED.forEach((name) => required.add(name));
}

if (mode === "all" || mode === "frontend") {
  FRONTEND_REQUIRED.forEach((name) => required.add(name));
}

for (const rule of OPTIONAL_RULES) {
  if (rule.when()) {
    rule.names.forEach((name) => required.add(name));
  }
}

if (checkBackend && process.env.METRICS_ENABLED === "true") {
  required.add("PROMETHEUS_URL");
}

const missing = [...required].filter((name) => !hasValue(process.env[name]));
const weak = [];

if (checkBackend && process.env.METRICS_ENABLED === "true") {
  const token = process.env.METRICS_AUTH_TOKEN?.trim();
  const tokenFile = process.env.METRICS_AUTH_TOKEN_FILE?.trim();

  if (!token && !tokenFile) {
    missing.push("METRICS_AUTH_TOKEN or METRICS_AUTH_TOKEN_FILE");
  }

  if (token && tokenFile) {
    weak.push("configure only one of METRICS_AUTH_TOKEN or METRICS_AUTH_TOKEN_FILE");
  }

  if (token && token.length < 32) {
    weak.push("METRICS_AUTH_TOKEN must be at least 32 characters");
  }

  if (token && /replace-this|change-?me|example|default|secret/i.test(token)) {
    weak.push("METRICS_AUTH_TOKEN still contains a known placeholder");
  }

  if (process.env.METRICS_PROVIDER !== "prometheus") {
    weak.push("METRICS_PROVIDER must be prometheus when metrics are enabled");
  }

  if (
    hasValue(process.env.METRICS_PATH) &&
    (!/^\/[A-Za-z0-9/_-]*$/.test(process.env.METRICS_PATH.trim()) ||
      process.env.METRICS_PATH.includes("//"))
  ) {
    weak.push("METRICS_PATH must be a valid absolute route path");
  }

  if (hasValue(process.env.PROMETHEUS_URL) && !isHttp(process.env.PROMETHEUS_URL)) {
    weak.push("PROMETHEUS_URL must be a valid HTTP(S) URL");
  }
}

for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
  if (required.has(name) && hasValue(process.env[name]) && process.env[name].length < 32) {
    weak.push(`${name} must be at least 32 characters`);
  }

  if (
    required.has(name) &&
    hasValue(process.env[name]) &&
    /replace-this|change-?me|example|default|secret/i.test(process.env[name])
  ) {
    weak.push(`${name} still contains a known placeholder`);
  }
}

if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  weak.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
}

if (process.env.CORS_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).includes("*")) {
  weak.push("CORS_ALLOWED_ORIGINS cannot contain a wildcard");
}

if (hasValue(process.env.WEBAUTHN_ORIGIN) && hasValue(process.env.WEBAUTHN_RP_ID)) {
  try {
    const origin = new URL(process.env.WEBAUTHN_ORIGIN);
    const rpId = process.env.WEBAUTHN_RP_ID.trim().toLowerCase();
    const hostname = origin.hostname.toLowerCase();

    if (hostname !== rpId && !hostname.endsWith(`.${rpId}`)) {
      weak.push("WEBAUTHN_RP_ID must match the WebAuthn origin hostname or its registrable suffix");
    }

    if (process.env.NODE_ENV === "production" && origin.protocol !== "https:" && hostname !== "localhost") {
      weak.push("WEBAUTHN_ORIGIN must use HTTPS outside localhost");
    }
  } catch {
    weak.push("WEBAUTHN_ORIGIN must be a valid absolute URL");
  }
}

if (
  process.env.NODE_ENV === "production" &&
  hasValue(process.env.NEXT_PUBLIC_API_URL) &&
  !process.env.NEXT_PUBLIC_API_URL.startsWith("https://") &&
  !process.env.NEXT_PUBLIC_API_URL.includes("localhost")
) {
  weak.push("NEXT_PUBLIC_API_URL must use HTTPS outside localhost");
}

if (
  process.env.NODE_ENV === "production" &&
  process.env.AUTH_EMAIL_PRINT_CODES_TO_CONSOLE !== "false"
) {
  weak.push("AUTH_EMAIL_PRINT_CODES_TO_CONSOLE must be false in production");
}

if (process.env.NODE_ENV === "production" && process.env.AUTH_DEV_DISCLOSE_CODES !== "false") {
  weak.push("AUTH_DEV_DISCLOSE_CODES must be false in production");
}

if (missing.length > 0 || weak.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        mode,
        missing,
        invalid: weak
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        checked: required.size
      },
      null,
      2
    )
  );
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttp(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
