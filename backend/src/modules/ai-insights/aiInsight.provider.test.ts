import { InsightType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAiInsightProviderFromEnv,
  ExternalHttpAiInsightProvider,
  NON_DIAGNOSTIC_WORKLOAD_COPY,
  RuleBasedAiInsightProvider,
  buildAiInsightPromptPayload,
  resolveAiInsightProviderConfig
} from "./aiInsight.provider.js";
import type { ProdStats } from "./aiInsight.types.js";

const steadyStats: ProdStats = {
  focusHoursLast3Days: 2,
  failedTaskRateLast7Days: 0,
  completedQuestsLast7Days: 2,
  activeFocusDaysLast7Days: 2
};

function waitForAbort(_url: string, init?: RequestInit) {
  return new Promise<never>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });
}

describe("AI insight providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the rule provider unless external HTTP is explicitly selected", () => {
    const provider = createAiInsightProviderFromEnv({
      AI_INSIGHT_PROVIDER: "rules"
    });

    expect(provider).toBeInstanceOf(RuleBasedAiInsightProvider);
  });

  it("keeps rule provider config ready by default", () => {
    expect(resolveAiInsightProviderConfig({})).toEqual({
      provider: "RULES",
      status: "ready",
      hasApiKey: false,
      externalProviderName: null,
      authHeaderName: null,
      authScheme: null,
      requestFormat: "levelupx-insight-v1",
      hostedRolloutReady: false,
      timeoutMs: 5000,
      promptVersion: "rules-v1",
      promptAudience: "self-directed learners",
      maxInsights: 3
    });
  });

  it("reports missing endpoint for external HTTP config", () => {
    expect(
      resolveAiInsightProviderConfig({
        AI_INSIGHT_PROVIDER: "external-http",
        AI_INSIGHT_API_KEY: "secret"
      })
    ).toEqual({
      provider: "EXTERNAL_HTTP",
      status: "missing-endpoint",
      endpoint: undefined,
      hasApiKey: true,
      externalProviderName: "custom-http",
      authHeaderName: "Authorization",
      authScheme: "Bearer",
      requestFormat: "levelupx-insight-v1",
      hostedRolloutReady: false,
      timeoutMs: 5000,
      promptVersion: "rules-v1",
      promptAudience: "self-directed learners",
      maxInsights: 3
    });
  });

  it("reports ready external HTTP config with prompt contract settings", () => {
    expect(
      resolveAiInsightProviderConfig({
        AI_INSIGHT_PROVIDER: "external-http",
        AI_INSIGHT_ENDPOINT: " https://example.test/insights ",
        AI_INSIGHT_API_KEY: "secret",
        AI_INSIGHT_TIMEOUT_MS: "2500",
        AI_INSIGHT_PROMPT_VERSION: "external-v2",
        AI_INSIGHT_PROMPT_AUDIENCE: " exam prep learners ",
        AI_INSIGHT_MAX_INSIGHTS: "4",
        AI_INSIGHT_EXTERNAL_PROVIDER_NAME: " hosted-profile ",
        AI_INSIGHT_EXTERNAL_AUTH_HEADER: "X-Api-Key",
        AI_INSIGHT_EXTERNAL_AUTH_SCHEME: "Token"
      })
    ).toEqual({
      provider: "EXTERNAL_HTTP",
      status: "ready",
      endpoint: "https://example.test/insights",
      hasApiKey: true,
      externalProviderName: "hosted-profile",
      authHeaderName: "X-Api-Key",
      authScheme: "Token",
      requestFormat: "levelupx-insight-v1",
      hostedRolloutReady: true,
      timeoutMs: 2500,
      promptVersion: "external-v2",
      promptAudience: "exam prep learners",
      maxInsights: 4
    });
  });

  it("falls back to rules when external HTTP has no endpoint", () => {
    const provider = createAiInsightProviderFromEnv({
      AI_INSIGHT_PROVIDER: "external-http"
    });

    expect(provider).toBeInstanceOf(RuleBasedAiInsightProvider);
  });

  it("returns rule-based fallback insights for steady activity", async () => {
    const insights = await new RuleBasedAiInsightProvider().produceInsights({
      userId: "user-1",
      stats: steadyStats
    });

    expect(insights).toEqual([
      expect.objectContaining({
        insightType: InsightType.RECOVERY_RECOMMENDATION,
        confidenceScore: 0.64
      })
    ]);
  });

  it("describes heavy workload as non-diagnostic rule guidance", async () => {
    const insights = await new RuleBasedAiInsightProvider().produceInsights({
      userId: "user-1",
      stats: {
        ...steadyStats,
        focusHoursLast3Days: 19
      }
    });

    expect(insights[0]).toMatchObject({
      insightType: InsightType.BURNOUT_WARNING,
      title: "Workload recovery signal",
      confidenceScore: 0.82
    });
    expect(insights[0]?.message).toContain("not a medical assessment");
    expect(insights[0]?.title.toLowerCase()).not.toContain("burnout");
  });

  it("normalizes external HTTP provider responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          insights: [
            {
              insightType: InsightType.STUDY_SUGGESTION,
              title: "  Try a focused review  ",
              message: "  Block 25 minutes for the topic with the most recent misses.  ",
              confidenceScore: 1.4
            },
            {
              insightType: "UNKNOWN",
              title: "Ignored",
              message: "Ignored",
              confidenceScore: 0.5
            }
          ]
        })
      })
    );

    const insights = await new ExternalHttpAiInsightProvider({
      endpoint: "https://example.test/insights",
      apiKey: "secret",
      promptVersion: "external-v2",
      promptAudience: "exam prep learners",
      maxInsights: 2
    }).produceInsights({
      userId: "user-1",
      stats: steadyStats
    });

    const requestBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));

    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/insights",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Authorization: "Bearer secret"
        })
      })
    );
    expect(requestBody).toEqual(
      expect.objectContaining({
        userId: "user-1",
        stats: steadyStats,
        provider: {
          name: "custom-http",
          requestFormat: "levelupx-insight-v1"
        },
        prompt: expect.objectContaining({
          version: "external-v2",
          audience: "exam prep learners",
          maxInsights: 2,
          allowedInsightTypes: expect.arrayContaining([InsightType.STUDY_SUGGESTION]),
          instructions: expect.arrayContaining(["Prefer specific next actions over generic motivation."]),
          outputSchema: expect.objectContaining({
            insights: expect.objectContaining({
              confidenceScore: "number from 0 to 1"
            })
          })
        })
      })
    );
    expect(insights).toEqual([
      {
        insightType: InsightType.STUDY_SUGGESTION,
        title: "Try a focused review",
        message: "Block 25 minutes for the topic with the most recent misses.",
        confidenceScore: 1
      }
    ]);
  });

  it("replaces diagnostic external workload copy with controlled guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          insights: [
            {
              insightType: InsightType.BURNOUT_WARNING,
              title: "Clinical burnout diagnosis",
              message: "You have a medical condition and need treatment.",
              confidenceScore: 0.91
            }
          ]
        })
      })
    );

    const insights = await new ExternalHttpAiInsightProvider({
      endpoint: "https://example.test/insights"
    }).produceInsights({
      userId: "user-1",
      stats: steadyStats
    });

    expect(insights).toEqual([
      {
        insightType: InsightType.BURNOUT_WARNING,
        ...NON_DIAGNOSTIC_WORKLOAD_COPY,
        confidenceScore: 0.91
      }
    ]);
  });

  it("sends hosted provider profile metadata and configurable auth headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ insights: [] })
      })
    );

    await new ExternalHttpAiInsightProvider({
      endpoint: "https://example.test/insights",
      apiKey: "secret",
      externalProviderName: "hosted-profile",
      authHeaderName: "X-Api-Key",
      authScheme: "Token"
    }).produceInsights({
      userId: "user-1",
      stats: steadyStats
    });

    const requestBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body));

    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/insights",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Api-Key": "Token secret"
        })
      })
    );
    expect(requestBody.provider).toEqual({
      name: "hosted-profile",
      requestFormat: "levelupx-insight-v1"
    });
  });

  it("aborts external HTTP provider requests after the configured timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(waitForAbort));

    const promise = new ExternalHttpAiInsightProvider({
      endpoint: "https://example.test/slow-insights",
      timeoutMs: 25
    }).produceInsights({
      userId: "user-1",
      stats: steadyStats
    });
    const expectation = expect(promise).rejects.toThrow("AI insight provider timed out after 25ms");

    await vi.advanceTimersByTimeAsync(25);

    await expectation;
  });

  it("builds a bounded prompt payload for external providers", () => {
    expect(
      buildAiInsightPromptPayload({
        version: "external-v3",
        audience: "night study users",
        maxInsights: 10
      })
    ).toEqual(
      expect.objectContaining({
        version: "external-v3",
        audience: "night study users",
        maxInsights: 5,
        allowedInsightTypes: expect.arrayContaining([InsightType.BURNOUT_WARNING]),
        instructions: expect.arrayContaining(["Use the provided stats only; do not invent private user details."])
      })
    );
  });
});
