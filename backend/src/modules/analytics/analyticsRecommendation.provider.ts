import type { FocusConsistencyDto, WeeklySummaryDto } from "./analytics.types.js";

export type AnalyticsRecommendationInput = {
  summary: WeeklySummaryDto;
  consistency: FocusConsistencyDto;
};

export type AnalyticsRecommendationProviderConfig = {
  provider: "rules" | "external-http";
  endpoint?: string;
  apiKey?: string;
  timeoutMs: number;
  promptVersion: string;
  ready: boolean;
};

export interface IAnalyticsRecommendationProvider {
  name: string;
  generate(metrics: AnalyticsRecommendationInput): Promise<string[]>;
}

export class RuleBasedAnalyticsRecommendationProvider implements IAnalyticsRecommendationProvider {
  readonly name = "rule-based";

  async generate(metrics: AnalyticsRecommendationInput) {
    const recommendations: string[] = [];

    if (metrics.summary.completionRate < 60) {
      recommendations.push("Reduce active quest scope until weekly completion clears 60%.");
    } else {
      recommendations.push("Completion is healthy. Add one harder quest only if focus time stays stable.");
    }

    if (metrics.consistency.consistencyRate < 50) {
      recommendations.push("Add short focus blocks on quiet days before increasing total workload.");
    } else {
      recommendations.push("Consistency is holding. Protect the same focus window next week.");
    }

    if (metrics.summary.failedQuests > metrics.summary.completedQuests) {
      recommendations.push("Review failed quests for oversized estimates or unclear task definitions.");
    }

    if (metrics.summary.focusMinutes === 0) {
      recommendations.push("Start with one tracked focus session so analytics can separate effort from quest outcomes.");
    }

    return recommendations.slice(0, 3);
  }
}

export class ExternalHttpAnalyticsRecommendationProvider implements IAnalyticsRecommendationProvider {
  readonly name = "external-http";

  constructor(private readonly providerCfg: AnalyticsRecommendationProviderConfig) {}

  async generate(metrics: AnalyticsRecommendationInput) {
    if (!this.providerCfg.ready || !this.providerCfg.endpoint) {
      return [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.providerCfg.timeoutMs);

    try {
      const reply = await fetch(this.providerCfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.providerCfg.apiKey ? { Authorization: `Bearer ${this.providerCfg.apiKey}` } : {})
        },
        body: JSON.stringify({
          promptVersion: this.providerCfg.promptVersion,
          summary: metrics.summary,
          consistency: metrics.consistency
        }),
        signal: controller.signal
      });

      if (!reply.ok) {
        throw new Error(`Analytics recommendation provider failed with status ${reply.status}`);
      }

      const body = (await reply.json()) as { recommendations?: unknown };
      return this.normalizeRecommendations(body.recommendations);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeRecommendations(raw: unknown) {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((recommendation): recommendation is string => typeof recommendation === "string")
      .map((recommendation) => recommendation.trim())
      .filter(Boolean)
      .slice(0, 3);
  }
}

export function resolveAnalyticsRecommendationProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): AnalyticsRecommendationProviderConfig {
  const provider = env.ANALYTICS_RECOMMENDATION_PROVIDER === "external-http" ? "external-http" : "rules";
  const endpoint = trimOptional(env.ANALYTICS_RECOMMENDATION_ENDPOINT);
  const apiKey = trimOptional(env.ANALYTICS_RECOMMENDATION_API_KEY);
  const timeoutMs = readPositiveInt(env.ANALYTICS_RECOMMENDATION_TIMEOUT_MS) ?? 5000;
  const promptVersion = trimOptional(env.ANALYTICS_RECOMMENDATION_PROMPT_VERSION) ?? "analytics-rules-v1";

  return {
    provider,
    endpoint,
    apiKey,
    timeoutMs,
    promptVersion,
    ready: provider === "rules" || Boolean(endpoint && apiKey)
  };
}

export function createAnalyticsRecommendationProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env
): IAnalyticsRecommendationProvider {
  const providerCfg = resolveAnalyticsRecommendationProviderConfig(env);

  if (providerCfg.provider === "external-http" && providerCfg.ready) {
    return new ExternalHttpAnalyticsRecommendationProvider(providerCfg);
  }

  return new RuleBasedAnalyticsRecommendationProvider();
}

function trimOptional(raw: string | undefined) {
  return raw?.trim() || undefined;
}

function readPositiveInt(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
