import { InsightType, type AiInsight, type AiPromptRun } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  NON_DIAGNOSTIC_WORKLOAD_COPY,
  type IAiInsightProvider
} from "./aiInsight.provider.js";
import type { IAiInsightRepository } from "./aiInsight.repository.js";
import { AiInsightService, resolveInsightScheduleStatus } from "./aiInsight.service.js";
import type { NewInsight, ProdStats } from "./aiInsight.types.js";

const stats: ProdStats = {
  focusHoursLast3Days: 1,
  failedTaskRateLast7Days: 0,
  completedQuestsLast7Days: 1,
  activeFocusDaysLast7Days: 1
};

function makeInsight(userId: string, insight: NewInsight, providerSource?: string): AiInsight {
  return {
    id: `${userId}-${insight.insightType}`,
    userId,
    insightType: insight.insightType,
    title: insight.title,
    message: insight.message,
    confidenceScore: insight.confidenceScore,
    providerSource: providerSource ?? null,
    feedbackValue: null,
    feedbackComment: null,
    feedbackAt: null,
    generatedAt: new Date("2026-05-21T00:00:00.000Z")
  };
}

function storeInsights(userId: string, insights: NewInsight[], providerSource?: string) {
  return insights.map((insight) => makeInsight(userId, insight, providerSource));
}

function makeRepo(overrides: Partial<IAiInsightRepository> = {}): IAiInsightRepository {
  return {
    async findForUser() {
      return [];
    },
    async findFeedbackForUser() {
      return [];
    },
    async findPromptRunsForUser() {
      return [];
    },
    async getProductivityStats() {
      return stats;
    },
    async getStudyScheduleContext() {
      return {
        quests: [],
        focusMinutesLast3Days: 0,
        activeFocusDaysLast7Days: 0
      };
    },
    async getSchedulingTrainingContext() {
      return {
        questOutcomes: [],
        focusMinutesLast14Days: 0,
        activeFocusDaysLast14Days: 0
      };
    },
    async createMany(userId, insights, providerSource) {
      return storeInsights(userId, insights, providerSource);
    },
    async createPromptRun(run) {
      return makePromptRun(run);
    },
    async updateFeedback() {
      return null;
    },
    ...overrides
  };
}

describe("AiInsightService", () => {
  it("falls back to rule provider when the configured provider returns no insights", async () => {
    const created: NewInsight[] = [];
    const repo = makeRepo({
      async createMany(userId, insights, providerSource) {
        created.push(...insights);
        return storeInsights(userId, insights, providerSource);
      }
    });
    const emptyProvider: IAiInsightProvider = {
      name: "empty",
      async produceInsights() {
        return [];
      }
    };

    const generated = await new AiInsightService(repo, emptyProvider).produceInsights("user-1");

    expect(created).toEqual([
      expect.objectContaining({
        insightType: InsightType.RECOVERY_RECOMMENDATION
      })
    ]);
    expect(generated.insights).toHaveLength(1);
    expect(generated.meta).toMatchObject({
      providerSource: "rule-based",
      promptVersion: "rules-v1",
      usedFallback: true,
      insightCount: 1
    });
    expect(generated.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("falls back to rule provider when the configured provider fails", async () => {
    const created: NewInsight[] = [];
    const repo = makeRepo({
      async createMany(userId, insights, providerSource) {
        created.push(...insights);
        return storeInsights(userId, insights, providerSource);
      }
    });
    const failingProvider: IAiInsightProvider = {
      name: "failing",
      async produceInsights() {
        throw new Error("provider timed out");
      }
    };

    const generated = await new AiInsightService(repo, failingProvider).produceInsights("user-1");

    expect(created).toEqual([
      expect.objectContaining({
        insightType: InsightType.RECOVERY_RECOMMENDATION
      })
    ]);
    expect(generated.insights).toHaveLength(1);
    expect(generated.meta).toMatchObject({
      providerSource: "rule-based",
      promptVersion: "rules-v1",
      usedFallback: true,
      insightCount: 1
    });
  });

  it("returns primary provider metadata when the primary provider succeeds", async () => {
    const primaryProvider: IAiInsightProvider = {
      name: "external-http",
      async produceInsights() {
        return [
          {
            insightType: InsightType.STUDY_SUGGESTION,
            title: "External tip",
            message: "Focus on math topics.",
            confidenceScore: 0.88
          }
        ];
      }
    };

    const generated = await new AiInsightService(makeRepo(), primaryProvider).produceInsights("user-1");

    expect(generated.insights).toHaveLength(1);
    expect(generated.insights[0]!.providerSource).toBe("external-http");
    expect(generated.meta).toMatchObject({
      providerSource: "external-http",
      promptVersion: "rules-v1",
      usedFallback: false,
      insightCount: 1
    });
  });

  it("normalizes diagnostic provider workload copy before persistence and response", async () => {
    const created: NewInsight[] = [];
    const repo = makeRepo({
      async createMany(userId, insights, providerSource) {
        created.push(...insights);
        return storeInsights(userId, insights, providerSource);
      }
    });
    const provider: IAiInsightProvider = {
      name: "untrusted-external",
      async produceInsights() {
        return [
          {
            insightType: InsightType.BURNOUT_WARNING,
            title: "Clinical burnout diagnosis",
            message: "You have a medical disorder and require treatment.",
            confidenceScore: 0.9
          }
        ];
      }
    };

    const generated = await new AiInsightService(repo, provider).produceInsights("user-1");

    expect(created).toEqual([
      {
        insightType: InsightType.BURNOUT_WARNING,
        ...NON_DIAGNOSTIC_WORKLOAD_COPY,
        confidenceScore: 0.9
      }
    ]);
    expect(generated.insights[0]).toMatchObject(NON_DIAGNOSTIC_WORKLOAD_COPY);
  });

  it("returns configured prompt version metadata", async () => {
    const generated = await new AiInsightService(
      makeRepo(),
      new StubInsightProvider("external-http"),
      new StubInsightProvider("rule-based"),
      "external-v2"
    ).produceInsights("user-1");

    expect(generated.meta.promptVersion).toBe("external-v2");
  });

  it("records prompt run history for manual generation", async () => {
    const promptRuns: unknown[] = [];
    const repo = makeRepo({
      async createPromptRun(run) {
        promptRuns.push(run);
        return makePromptRun(run);
      }
    });

    await new AiInsightService(
      repo,
      new StubInsightProvider("external-http"),
      new StubInsightProvider("rule-based"),
      "external-v2"
    ).produceInsights("user-1");

    expect(promptRuns).toEqual([
      expect.objectContaining({
        userId: "user-1",
        providerSource: "external-http",
        promptVersion: "external-v2",
        promptAudience: "self-directed learners",
        maxInsights: 3,
        usedFallback: false,
        insightCount: 1,
        trigger: "MANUAL"
      })
    ]);
  });

  it("builds a deadline-push study schedule from active quests", async () => {
    const repo = makeRepo({
      async getStudyScheduleContext() {
        return {
          quests: [
            {
              id: "quest-overdue",
              title: "Submit lab notes",
              difficulty: "MEDIUM",
              category: "Science",
              estimatedMinutes: 45,
              status: "IN_PROGRESS",
              dueDate: new Date("2026-05-20T00:00:00.000Z")
            },
            {
              id: "quest-later",
              title: "Read chapter",
              difficulty: "EASY",
              category: "Reading",
              estimatedMinutes: 30,
              status: "PENDING",
              dueDate: new Date("2026-05-30T00:00:00.000Z")
            }
          ],
          focusMinutesLast3Days: 90,
          activeFocusDaysLast7Days: 2
        };
      }
    });

    const plan = await new AiInsightService(
      repo,
      undefined,
      undefined,
      undefined,
      () => new Date("2026-05-25T00:00:00.000Z")
    ).draftStudySchedule("user-1");

    expect(plan.strategy).toBe("DEADLINE_PUSH");
    expect(plan.overdueCount).toBe(1);
    expect(plan.focusBudgetMinutes).toBe(90);
    expect(plan.steps[0]).toMatchObject({
      questId: "quest-overdue",
      questTitle: "Submit lab notes",
      minutes: 25
    });
  });

  it("builds a recovery study schedule after heavy focus load", async () => {
    const repo = makeRepo({
      async getStudyScheduleContext() {
        return {
          quests: [
            {
              id: "quest-1",
              title: "Draft essay",
              difficulty: "HARD",
              category: "Writing",
              estimatedMinutes: 60,
              status: "PENDING",
              dueDate: null
            }
          ],
          focusMinutesLast3Days: 420,
          activeFocusDaysLast7Days: 5
        };
      }
    });

    const plan = await new AiInsightService(repo).draftStudySchedule("user-1");

    expect(plan.strategy).toBe("RECOVERY");
    expect(plan.riskLevel).toBe("HIGH");
    expect(plan.recommendedBlockMinutes).toBe(15);
    expect(plan.steps[0]).toMatchObject({
      label: "Recovery warm-up",
      questId: null
    });
  });

  it("builds scheduling training signals from quest outcomes", async () => {
    const repo = makeRepo({
      async getSchedulingTrainingContext() {
        return {
          questOutcomes: [
            {
              id: "quest-1",
              title: "Finish report",
              difficulty: "MEDIUM",
              category: "Writing",
              estimatedMinutes: 45,
              status: "COMPLETED",
              dueDate: new Date("2026-05-22T12:00:00.000Z"),
              createdAt: new Date("2026-05-21T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T10:00:00.000Z")
            },
            {
              id: "quest-2",
              title: "Practice set",
              difficulty: "HARD",
              category: "Math",
              estimatedMinutes: 60,
              status: "FAILED",
              dueDate: new Date("2026-05-22T12:00:00.000Z"),
              createdAt: new Date("2026-05-21T12:00:00.000Z"),
              updatedAt: new Date("2026-05-23T12:00:00.000Z")
            }
          ],
          focusMinutesLast14Days: 210,
          activeFocusDaysLast14Days: 4
        };
      }
    });

    const training = await new AiInsightService(repo).compileTrainingDataset("user-1");

    expect(training).toMatchObject({
      readiness: "COLLECTING",
      sampleCount: 2,
      completedCount: 1,
      failedCount: 1,
      focusMinutesLast14Days: 210,
      activeFocusDaysLast14Days: 4
    });
    expect(training.signals).toEqual([
      expect.objectContaining({
        questId: "quest-1",
        completionLabel: "COMPLETED",
        leadTimeHours: 24,
        resolvedAfterDueDate: false
      }),
      expect.objectContaining({
        questId: "quest-2",
        completionLabel: "FAILED",
        resolvedAfterDueDate: true
      })
    ]);
  });

  it("lists prompt run history for a user", async () => {
    const run = makePromptRun({
      userId: "user-1",
      providerSource: "external-http",
      promptVersion: "external-v3",
      promptAudience: "exam prep learners",
      maxInsights: 4,
      usedFallback: false,
      insightCount: 2,
      durationMs: 37,
      trigger: "MANUAL"
    });
    const repo = makeRepo({
      async findPromptRunsForUser(userId) {
        expect(userId).toBe("user-1");
        return [run];
      }
    });

    await expect(new AiInsightService(repo).fetchPromptRunHistory("user-1")).resolves.toEqual([
      {
        id: run.id,
        providerSource: "external-http",
        promptVersion: "external-v3",
        promptAudience: "exam prep learners",
        maxInsights: 4,
        usedFallback: false,
        insightCount: 2,
        durationMs: 37,
        trigger: "MANUAL",
        createdAt: "2026-05-21T00:00:00.000Z"
      }
    ]);
  });

  it("resolves hosted schedule metadata from environment intent", () => {
    expect(
      resolveInsightScheduleStatus(
        {
          AI_INSIGHT_SCHEDULE_ENABLED: "true",
          AI_INSIGHT_SCHEDULE_PROVIDER: "github-actions",
          AI_INSIGHT_SCHEDULE_DEDUP_HOURS: "6",
          AI_INSIGHT_SCHEDULE_TIMEZONE: "Asia/Calcutta",
          AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT: "25"
        } as NodeJS.ProcessEnv,
        "external-v2"
      )
    ).toEqual({
      jobName: "scheduled-insights",
      command: "npm run jobs:run -- scheduled-insights",
      cadence: "twice-daily",
      targetHoursUtc: [6, 18],
      dedupWindowHours: 6,
      hostedEnabled: true,
      effectiveHostedEnabled: true,
      hostedProvider: "github-actions",
      timezone: "Asia/Calcutta",
      promptVersion: "external-v2",
      rolloutPercent: 25,
      externalProviderRequired: false,
      externalProviderReady: false,
      externalProviderName: null,
      externalProviderAuth: null,
      externalProviderRequestFormat: "levelupx-insight-v1",
      hostedRolloutReady: false,
      rolloutBlockedReason: null
    });
  });

  it("blocks hosted schedule status when external provider is required but not ready", () => {
    expect(
      resolveInsightScheduleStatus({
        AI_INSIGHT_SCHEDULE_ENABLED: "true",
        AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL: "true",
        AI_INSIGHT_PROVIDER: "rules"
      } as NodeJS.ProcessEnv)
    ).toEqual(
      expect.objectContaining({
        hostedEnabled: true,
        effectiveHostedEnabled: false,
        externalProviderRequired: true,
        externalProviderReady: false,
        rolloutBlockedReason: "External provider is required for scheduled rollout but is not ready."
      })
    );
  });

  it("reports the active rule prompt registry contract", () => {
    expect(new AiInsightService(makeRepo()).registryStatus({})).toEqual(
      expect.objectContaining({
        provider: "RULES",
        providerStatus: "ready",
        endpointConfigured: false,
        apiKeyConfigured: false,
        externalProviderName: null,
        externalAuthHeader: null,
        externalAuthScheme: null,
        externalRequestFormat: "levelupx-insight-v1",
        hostedRolloutReady: false,
        timeoutMs: 5000,
        promptVersion: "rules-v1",
        promptAudience: "self-directed learners",
        maxInsights: 3,
        promptContract: expect.objectContaining({
          version: "rules-v1",
          allowedInsightTypes: expect.arrayContaining([InsightType.STUDY_SUGGESTION]),
          instructions: expect.arrayContaining(["Prefer specific next actions over generic motivation."])
        }),
        rolloutNotes: expect.arrayContaining(["Rule-based prompts are active."])
      })
    );
  });

  it("reports external prompt registry readiness", () => {
    expect(
      new AiInsightService(makeRepo()).registryStatus({
        AI_INSIGHT_PROVIDER: "external-http",
        AI_INSIGHT_ENDPOINT: "https://example.test/insights",
        AI_INSIGHT_API_KEY: "secret",
        AI_INSIGHT_TIMEOUT_MS: "2500",
        AI_INSIGHT_PROMPT_VERSION: "external-v4",
        AI_INSIGHT_PROMPT_AUDIENCE: "exam prep learners",
        AI_INSIGHT_MAX_INSIGHTS: "4",
        AI_INSIGHT_EXTERNAL_PROVIDER_NAME: "hosted-profile",
        AI_INSIGHT_EXTERNAL_AUTH_HEADER: "X-Api-Key",
        AI_INSIGHT_EXTERNAL_AUTH_SCHEME: "Token"
      })
    ).toEqual(
      expect.objectContaining({
        provider: "EXTERNAL_HTTP",
        providerStatus: "ready",
        endpointConfigured: true,
        apiKeyConfigured: true,
        externalProviderName: "hosted-profile",
        externalAuthHeader: "X-Api-Key",
        externalAuthScheme: "Token",
        externalRequestFormat: "levelupx-insight-v1",
        hostedRolloutReady: true,
        timeoutMs: 2500,
        promptVersion: "external-v4",
        promptAudience: "exam prep learners",
        maxInsights: 4,
        promptContract: expect.objectContaining({
          version: "external-v4",
          audience: "exam prep learners",
          maxInsights: 4
        }),
        rolloutNotes: expect.arrayContaining(["hosted-profile is ready for manual and scheduled generation paths."])
      })
    );
  });

  it("stores insight feedback for the owning user", async () => {
    const feedbackInsight = makeInsight("user-1", {
      insightType: InsightType.STUDY_SUGGESTION,
      title: "Try a review",
      message: "Review the hardest topic first.",
      confidenceScore: 0.7
    });
    const repo = makeRepo({
      async updateFeedback(change) {
        expect(change).toMatchObject({
          userId: "user-1",
          insightId: "insight-1",
          feedback: {
            feedbackValue: "HELPFUL",
            feedbackComment: "This matched my study plan."
          }
        });

        return {
          ...feedbackInsight,
          id: change.insightId,
          feedbackValue: change.feedback.feedbackValue,
          feedbackComment: change.feedback.feedbackComment ?? null,
          feedbackAt: new Date("2026-05-21T01:00:00.000Z")
        };
      }
    });

    const saved = await new AiInsightService(repo).submitFeedback("user-1", "insight-1", {
      feedbackValue: "HELPFUL",
      feedbackComment: "This matched my study plan."
    });

    expect(saved).toMatchObject({
      id: "insight-1",
      feedbackValue: "HELPFUL",
      feedbackComment: "This matched my study plan.",
      feedbackAt: "2026-05-21T01:00:00.000Z",
      providerSource: null
    });
  });

  it("summarizes provider and insight type learning signals from feedback", async () => {
    const feedbackAt = new Date("2026-05-22T03:00:00.000Z");
    const repo = makeRepo({
      async findFeedbackForUser(userId) {
        return [
          {
            ...makeInsight(userId, {
              insightType: InsightType.STUDY_SUGGESTION,
              title: "Useful study tip",
              message: "Study now.",
              confidenceScore: 0.8
            }, "rule-based"),
            id: "insight-1",
            feedbackValue: "HELPFUL",
            feedbackAt
          },
          {
            ...makeInsight(userId, {
              insightType: InsightType.STUDY_SUGGESTION,
              title: "Missed study tip",
              message: "Study later.",
              confidenceScore: 0.7
            }, "rule-based"),
            id: "insight-2",
            feedbackValue: "NOT_HELPFUL",
            feedbackAt: new Date("2026-05-22T02:00:00.000Z")
          },
          {
            ...makeInsight(userId, {
              insightType: InsightType.RECOVERY_RECOMMENDATION,
              title: "Useful recovery tip",
              message: "Rest.",
              confidenceScore: 0.75
            }, "external-http"),
            id: "insight-3",
            feedbackValue: "HELPFUL",
            feedbackAt: new Date("2026-05-22T01:00:00.000Z")
          }
        ];
      }
    });

    await expect(new AiInsightService(repo).compileLearningSummary("user-1")).resolves.toMatchObject({
      totalFeedback: 3,
      helpful: 2,
      notHelpful: 1,
      helpfulRate: 67,
      promptRunCount: 0,
      fallbackRunCount: 0,
      fallbackRate: 0,
      latestFeedbackAt: "2026-05-22T03:00:00.000Z",
      providerSignals: [
        {
          key: "rule-based",
          label: "rule based",
          helpful: 1,
          notHelpful: 1,
          total: 2,
          helpfulRate: 50
        },
        {
          key: "external-http",
          label: "external http",
          helpful: 1,
          notHelpful: 0,
          total: 1,
          helpfulRate: 100
        }
      ],
      typeSignals: expect.arrayContaining([
        expect.objectContaining({
          key: "STUDY_SUGGESTION",
          label: "study suggestion",
          total: 2,
          helpfulRate: 50
        })
      ]),
      promptVersionSignals: [],
      tuningActions: expect.arrayContaining([
        expect.objectContaining({
          severity: "INFO",
          title: "Collect more feedback"
        })
      ])
    });
  });

  it("turns prompt run fallback history into tuning actions", async () => {
    const repo = makeRepo({
      async findPromptRunsForUser(userId) {
        return [
          makePromptRun({
            userId,
            providerSource: "rule-based",
            promptVersion: "external-v5",
            promptAudience: "exam prep learners",
            maxInsights: 3,
            usedFallback: true,
            insightCount: 1,
            durationMs: 50,
            trigger: "SCHEDULED"
          }),
          makePromptRun({
            userId,
            providerSource: "external-http",
            promptVersion: "external-v5",
            promptAudience: "exam prep learners",
            maxInsights: 3,
            usedFallback: false,
            insightCount: 2,
            durationMs: 150,
            trigger: "MANUAL"
          })
        ];
      }
    });

    await expect(new AiInsightService(repo).compileLearningSummary("user-1")).resolves.toMatchObject({
      promptRunCount: 2,
      fallbackRunCount: 1,
      fallbackRate: 50,
      promptVersionSignals: [
        {
          key: "external-v5",
          label: "external-v5",
          totalRuns: 2,
          fallbackRuns: 1,
          fallbackRate: 50,
          averageDurationMs: 100,
          totalInsights: 3
        }
      ],
      recommendation: "Review external-v5 provider readiness before increasing scheduled delivery.",
      tuningActions: expect.arrayContaining([
        expect.objectContaining({
          severity: "ACTION",
          title: "Reduce fallback rate"
        })
      ])
    });
  });
});

class StubInsightProvider implements IAiInsightProvider {
  constructor(public readonly name: string) {}

  async produceInsights(): Promise<NewInsight[]> {
    return [
      {
        insightType: InsightType.STUDY_SUGGESTION,
        title: "Versioned tip",
        message: "Use the current prompt version.",
        confidenceScore: 0.8
      }
    ];
  }
}

function makePromptRun(run: {
  userId: string;
  providerSource: string;
  promptVersion: string;
  promptAudience: string;
  maxInsights: number;
  usedFallback: boolean;
  insightCount: number;
  durationMs: number;
  trigger: "MANUAL" | "SCHEDULED";
}): AiPromptRun {
  return {
    id: "prompt-run-1",
    userId: run.userId,
    providerSource: run.providerSource,
    promptVersion: run.promptVersion,
    promptAudience: run.promptAudience,
    maxInsights: run.maxInsights,
    usedFallback: run.usedFallback,
    insightCount: run.insightCount,
    durationMs: run.durationMs,
    trigger: run.trigger,
    createdAt: new Date("2026-05-21T00:00:00.000Z")
  };
}
