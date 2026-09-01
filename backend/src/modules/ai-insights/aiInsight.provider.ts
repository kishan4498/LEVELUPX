import { InsightType } from "@prisma/client";

import type { NewInsight, ProdStats } from "./aiInsight.types.js";

export type ProviderInput = {
  userId: string;
  stats: ProdStats;
};

export type PromptPayload = {
  version: string;
  audience: string;
  maxInsights: number;
  allowedInsightTypes: InsightType[];
  instructions: string[];
  outputSchema: {
    insights: {
      insightType: string;
      title: string;
      message: string;
      confidenceScore: string;
    };
  };
};

export interface IAiInsightProvider {
  name: string;
  produceInsights(request: ProviderInput): Promise<NewInsight[]>;
}

export type ProviderName = "RULES" | "EXTERNAL_HTTP";
export type ProviderStatus = "ready" | "missing-endpoint";
export type ExternalReqFormat = "levelupx-insight-v1";

export type ProviderCfg = {
  provider: ProviderName;
  status: ProviderStatus;
  endpoint?: string;
  hasApiKey: boolean;
  externalProviderName: string | null;
  authHeaderName: string | null;
  authScheme: string | null;
  requestFormat: ExternalReqFormat;
  hostedRolloutReady: boolean;
  timeoutMs: number;
  promptVersion: string;
  promptAudience: string;
  maxInsights: number;
};

const insightTypes = new Set(Object.values(InsightType));

export const NON_DIAGNOSTIC_WORKLOAD_COPY = {
  title: "Workload recovery signal",
  message: "Recent activity shows a heavier workload pattern. This productivity guidance is not a medical assessment; consider a recovery quest or a lighter session."
} as const;

export function enforceNonDiagnosticInsightCopy(insight: NewInsight): NewInsight {
  if (insight.insightType !== InsightType.BURNOUT_WARNING) {
    return insight;
  }

  return {
    ...insight,
    ...NON_DIAGNOSTIC_WORKLOAD_COPY
  };
}

export class RuleBasedAiInsightProvider implements IAiInsightProvider {
  name = "rule-based";

  async produceInsights(request: ProviderInput): Promise<NewInsight[]> {
    const { stats } = request;
    const insights: NewInsight[] = [];

    if (stats.focusHoursLast3Days > 18) {
      insights.push({
        insightType: InsightType.BURNOUT_WARNING,
        ...NON_DIAGNOSTIC_WORKLOAD_COPY,
        confidenceScore: 0.82
      });
    }

    if (stats.failedTaskRateLast7Days > 0.4) {
      insights.push({
        insightType: InsightType.SCHEDULE_OPTIMIZATION,
        title: "Reduce task difficulty",
        message: "Your failed quest rate is high this week. Try breaking hard quests into smaller, easier wins.",
        confidenceScore: 0.78
      });
    }

    if (stats.completedQuestsLast7Days === 0 && stats.activeFocusDaysLast7Days > 0) {
      insights.push({
        insightType: InsightType.STUDY_SUGGESTION,
        title: "Connect focus to quests",
        message: "You are doing focus sessions, but no quests were completed this week. Link sessions to concrete quests for clearer progress.",
        confidenceScore: 0.72
      });
    }

    if (stats.activeFocusDaysLast7Days >= 5) {
      insights.push({
        insightType: InsightType.CONSISTENCY_ANALYSIS,
        title: "Strong consistency pattern",
        message: "You focused on most days this week. Keep your next quests small enough to protect that rhythm.",
        confidenceScore: 0.76
      });
    }

    if (insights.length === 0) {
      insights.push({
        insightType: InsightType.RECOVERY_RECOMMENDATION,
        title: "Keep a balanced pace",
        message: "Your recent activity looks steady. Keep mixing focused quests with recovery time so progress stays sustainable.",
        confidenceScore: 0.64
      });
    }

    return insights;
  }
}

export type ExtProviderCfg = {
  endpoint?: string;
  apiKey?: string;
  externalProviderName?: string | null;
  authHeaderName?: string | null;
  authScheme?: string | null;
  requestFormat?: ExternalReqFormat;
  timeoutMs?: number;
  promptVersion?: string;
  promptAudience?: string;
  maxInsights?: number;
};

export class ExternalHttpAiInsightProvider implements IAiInsightProvider {
  name = "external-http";

  constructor(private readonly providerCfg: ExtProviderCfg) {}

  async produceInsights(request: ProviderInput): Promise<NewInsight[]> {
    if (!this.providerCfg.endpoint) {
      return [];
    }

    const controller = new AbortController();
    const timeoutMs = this.providerCfg.timeoutMs ?? 5000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let reply: Response;

    try {
      reply = await fetch(this.providerCfg.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders()
        },
        body: JSON.stringify({
          userId: request.userId,
          stats: request.stats,
          provider: {
            name: this.providerCfg.externalProviderName ?? "custom-http",
            requestFormat: this.providerCfg.requestFormat ?? "levelupx-insight-v1"
          },
          prompt: buildAiInsightPromptPayload({
            version: this.providerCfg.promptVersion ?? "rules-v1",
            audience: this.providerCfg.promptAudience,
            maxInsights: this.providerCfg.maxInsights
          })
        })
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`AI insight provider timed out after ${timeoutMs}ms`, { cause: error });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!reply.ok) {
      throw new Error(`AI insight provider failed with status ${reply.status}`);
    }

    const body = (await reply.json()) as { insights?: unknown };
    return this.normalizeInsights(body.insights);
  }

  private normalizeInsights(raw: unknown): NewInsight[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.flatMap((candidate) => {
      if (!this.isInsightPayload(candidate)) {
        return [];
      }

      return [
        enforceNonDiagnosticInsightCopy({
          insightType: candidate.insightType,
          title: candidate.title.trim().slice(0, 120),
          message: candidate.message.trim().slice(0, 800),
          confidenceScore: Math.min(1, Math.max(0, candidate.confidenceScore))
        })
      ];
    }).slice(0, this.providerCfg.maxInsights ?? 3);
  }

  private authHeaders(): Record<string, string> {
    if (!this.providerCfg.apiKey) {
      return {};
    }

    const header = this.providerCfg.authHeaderName ?? "Authorization";
    const scheme = this.providerCfg.authScheme ?? "Bearer";
    const credential =
      scheme.toLowerCase() === "none" ? this.providerCfg.apiKey : `${scheme} ${this.providerCfg.apiKey}`;

    return {
      [header]: credential
    };
  }

  private isInsightPayload(candidate: unknown): candidate is NewInsight {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    const insight = candidate as Record<string, unknown>;

    return (
      typeof insight.insightType === "string" &&
      insightTypes.has(insight.insightType as InsightType) &&
      typeof insight.title === "string" &&
      insight.title.trim().length > 0 &&
      typeof insight.message === "string" &&
      insight.message.trim().length > 0 &&
      typeof insight.confidenceScore === "number" &&
      Number.isFinite(insight.confidenceScore)
    );
  }
}

export function createAiInsightProviderFromEnv(env: NodeJS.ProcessEnv = process.env): IAiInsightProvider {
  const providerCfg = resolveAiInsightProviderConfig(env);

  if (providerCfg.provider === "EXTERNAL_HTTP" && providerCfg.status === "ready") {
    return new ExternalHttpAiInsightProvider({
      endpoint: providerCfg.endpoint,
      apiKey: env.AI_INSIGHT_API_KEY,
      externalProviderName: providerCfg.externalProviderName,
      authHeaderName: providerCfg.authHeaderName,
      authScheme: providerCfg.authScheme,
      requestFormat: providerCfg.requestFormat,
      timeoutMs: providerCfg.timeoutMs,
      promptVersion: providerCfg.promptVersion,
      promptAudience: providerCfg.promptAudience,
      maxInsights: providerCfg.maxInsights
    });
  }

  return new RuleBasedAiInsightProvider();
}

export function resolveAiInsightProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderCfg {
  const timeoutMs = readPositiveInt(env.AI_INSIGHT_TIMEOUT_MS) ?? 5000;
  const promptVersion = trimOptional(env.AI_INSIGHT_PROMPT_VERSION) ?? "rules-v1";
  const promptAudience = trimOptional(env.AI_INSIGHT_PROMPT_AUDIENCE) ?? "self-directed learners";
  const maxInsights = Math.min(readPositiveInt(env.AI_INSIGHT_MAX_INSIGHTS) ?? 3, 5);
  const externalProviderName = trimOptional(env.AI_INSIGHT_EXTERNAL_PROVIDER_NAME) ?? "custom-http";
  const authHeaderName = trimOptional(env.AI_INSIGHT_EXTERNAL_AUTH_HEADER) ?? "Authorization";
  const authScheme = trimOptional(env.AI_INSIGHT_EXTERNAL_AUTH_SCHEME) ?? "Bearer";
  const requestFormat: ExternalReqFormat = "levelupx-insight-v1";

  if (env.AI_INSIGHT_PROVIDER !== "external-http") {
    return {
      provider: "RULES",
      status: "ready",
      hasApiKey: false,
      externalProviderName: null,
      authHeaderName: null,
      authScheme: null,
      requestFormat,
      hostedRolloutReady: false,
      timeoutMs,
      promptVersion,
      promptAudience,
      maxInsights
    };
  }

  const endpoint = trimOptional(env.AI_INSIGHT_ENDPOINT);

  return {
    provider: "EXTERNAL_HTTP",
    status: endpoint ? "ready" : "missing-endpoint",
    endpoint,
    hasApiKey: Boolean(trimOptional(env.AI_INSIGHT_API_KEY)),
    externalProviderName,
    authHeaderName,
    authScheme,
    requestFormat,
    hostedRolloutReady: Boolean(endpoint),
    timeoutMs,
    promptVersion,
    promptAudience,
    maxInsights
  };
}

export function resolveAiInsightPromptVersion(env: NodeJS.ProcessEnv = process.env) {
  return resolveAiInsightProviderConfig(env).promptVersion;
}

function trimOptional(raw: string | undefined) {
  return raw?.trim() || undefined;
}

function readPositiveInt(raw: string | undefined) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildAiInsightPromptPayload(prompt: {
  version: string;
  audience?: string;
  maxInsights?: number;
}): PromptPayload {
  const maxInsights = Math.min(prompt.maxInsights ?? 3, 5);

  return {
    version: prompt.version,
    audience: prompt.audience ?? "self-directed learners",
    maxInsights,
    allowedInsightTypes: [...insightTypes],
    instructions: [
      "Generate concise, actionable productivity insights for the learner's recent LevelUpX activity.",
      "Prefer specific next actions over generic motivation.",
      "Use the provided stats only; do not invent private user details.",
      "Treat BURNOUT_WARNING as a non-diagnostic workload or recovery signal; never claim to detect or diagnose a medical condition.",
      "Return only insights that fit one of the allowed insight types.",
      `Return at most ${maxInsights} insights.`
    ],
    outputSchema: {
      insights: {
        insightType: "one of allowedInsightTypes",
        title: "non-empty string, max 120 characters",
        message: "non-empty string, max 800 characters",
        confidenceScore: "number from 0 to 1"
      }
    }
  };
}
