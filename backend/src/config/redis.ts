export type RedisRuntimePurpose = "rate-limit" | "job-queue" | "leaderboard-cache" | "distributed-lock";

export type RedisRuntimeStatus = "disabled" | "ready" | "missing-url";

export type RedisRuntimeConfig = {
  enabled: boolean;
  status: RedisRuntimeStatus;
  url?: string;
  namespace: string;
  purposes: RedisRuntimePurpose[];
};

const DEFAULT_PURPOSES: RedisRuntimePurpose[] = [
  "rate-limit",
  "job-queue",
  "leaderboard-cache",
  "distributed-lock"
];
const ALLOWED_PURPOSES = new Set<RedisRuntimePurpose>(DEFAULT_PURPOSES);

export function resolveRedisRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RedisRuntimeConfig {
  const enabled = env.REDIS_ENABLED === "true";
  const namespace = normalizeNamespace(env.REDIS_NAMESPACE);

  if (!enabled) {
    return {
      enabled: false,
      status: "disabled",
      namespace,
      purposes: []
    };
  }

  const url = normalizeUrl(env.REDIS_URL);
  const purposes = parsePurposes(env.REDIS_PURPOSES);

  return {
    enabled: true,
    status: url ? "ready" : "missing-url",
    url,
    namespace,
    purposes
  };
}

function normalizeNamespace(rawNamespace: string | undefined) {
  const namespace = rawNamespace?.trim();
  return namespace && namespace.length > 0 ? namespace : "levelupx";
}

function normalizeUrl(rawUrl: string | undefined) {
  const url = rawUrl?.trim();
  return url && url.length > 0 ? url : undefined;
}

function parsePurposes(rawPurposes: string | undefined): RedisRuntimePurpose[] {
  const requested = (rawPurposes ?? "")
    .split(",")
    .map((purpose) => purpose.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return [...DEFAULT_PURPOSES];
  }

  return requested.filter((purpose): purpose is RedisRuntimePurpose =>
    ALLOWED_PURPOSES.has(purpose as RedisRuntimePurpose)
  );
}
