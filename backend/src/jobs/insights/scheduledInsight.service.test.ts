import { InsightType, type AiInsight } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  NON_DIAGNOSTIC_WORKLOAD_COPY,
  type IAiInsightProvider
} from "../../modules/ai-insights/aiInsight.provider.js";
import type { NewInsight, ProdStats } from "../../modules/ai-insights/aiInsight.types.js";
import type { IScheduledInsightRepository } from "./scheduledInsight.repository.js";
import {
  ScheduledInsightService,
  isUserInScheduledRollout,
  resolveScheduledInsightRolloutControls
} from "./scheduledInsight.service.js";

const STEADY_STATS: ProdStats = {
  focusHoursLast3Days: 2,
  failedTaskRateLast7Days: 0,
  completedQuestsLast7Days: 2,
  activeFocusDaysLast7Days: 2
};

function makeInsight(userId: string, insight: NewInsight, providerSource: string): AiInsight {
  return {
    id: `${userId}-${insight.insightType}`,
    userId,
    insightType: insight.insightType,
    title: insight.title,
    message: insight.message,
    confidenceScore: insight.confidenceScore,
    providerSource,
    feedbackValue: null,
    feedbackComment: null,
    feedbackAt: null,
    generatedAt: new Date("2026-05-23T00:00:00.000Z")
  };
}

function makeInsights(userId: string, insights: NewInsight[], providerSource: string) {
  return insights.map((insight) => makeInsight(userId, insight, providerSource));
}

function makeRepo(overrides: Partial<IScheduledInsightRepository> = {}): IScheduledInsightRepository {
  return {
    async findActiveUserIds() {
      return [];
    },
    async getProductivityStats() {
      return STEADY_STATS;
    },
    async hasRecentInsight() {
      return false;
    },
    async createMany(userId, insights, providerSource) {
      return makeInsights(userId, insights, providerSource);
    },
    async createPromptRun() {},
    ...overrides
  };
}

describe("ScheduledInsightService", () => {
  it("produces insights for active users without recent insights", async () => {
    const created: { userId: string; insights: NewInsight[]; providerSource: string }[] = [];
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-1", "user-2"];
      },
      async createMany(userId, insights, providerSource) {
        created.push({ userId, insights, providerSource });
        return makeInsights(userId, insights, providerSource);
      }
    });

    const summary = await new ScheduledInsightService(repo).run({
      now: new Date("2026-05-23T12:00:00.000Z")
    });

    expect(summary).toMatchObject({
      usersScanned: 2,
      insightsGenerated: 2,
      usersSkipped: 0,
      providerSource: "rule-based",
      promptVersion: "rules-v1",
      usedFallback: false
    });
    expect(created).toHaveLength(2);
    expect(created[0]!.userId).toBe("user-1");
    expect(created[0]!.providerSource).toBe("rule-based");
    expect(created[1]!.userId).toBe("user-2");
  });

  it("skips users who have recent insights", async () => {
    const created: string[] = [];
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-recent", "user-stale"];
      },
      async hasRecentInsight(window) {
        return window.userId === "user-recent";
      },
      async createMany(userId, insights, providerSource) {
        created.push(userId);
        return makeInsights(userId, insights, providerSource);
      }
    });

    const summary = await new ScheduledInsightService(repo).run({
      now: new Date("2026-05-23T12:00:00.000Z")
    });

    expect(summary).toMatchObject({
      usersScanned: 2,
      insightsGenerated: 1,
      usersSkipped: 1
    });
    expect(created).toEqual(["user-stale"]);
  });

  it("returns zero counts when no active users exist", async () => {
    const summary = await new ScheduledInsightService(makeRepo()).run();

    expect(summary).toMatchObject({
      usersScanned: 0,
      insightsGenerated: 0,
      usersSkipped: 0
    });
  });

  it("falls back to rule provider when the configured provider fails", async () => {
    const created: { providerSource: string }[] = [];
    const provider: IAiInsightProvider = {
      name: "external-http",
      async produceInsights() {
        throw new Error("provider unavailable");
      }
    };
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-1"];
      },
      async createMany(userId, insights, providerSource) {
        created.push({ providerSource });
        return makeInsights(userId, insights, providerSource);
      }
    });

    const summary = await new ScheduledInsightService(repo, provider).run({
      now: new Date("2026-05-23T12:00:00.000Z")
    });

    expect(summary).toMatchObject({
      usersScanned: 1,
      insightsGenerated: 1,
      providerSource: "rule-based",
      promptVersion: "rules-v1",
      usedFallback: true
    });
    expect(created[0]!.providerSource).toBe("rule-based");
  });

  it("uses the primary provider when it succeeds", async () => {
    const created: { providerSource: string }[] = [];
    const provider: IAiInsightProvider = {
      name: "external-http",
      async produceInsights() {
        return [
          {
            insightType: InsightType.STUDY_SUGGESTION,
            title: "External tip",
            message: "Focus on review topics.",
            confidenceScore: 0.9
          }
        ];
      }
    };
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-1"];
      },
      async createMany(userId, insights, providerSource) {
        created.push({ providerSource });
        return makeInsights(userId, insights, providerSource);
      }
    });

    const summary = await new ScheduledInsightService(repo, provider).run({
      now: new Date("2026-05-23T12:00:00.000Z")
    });

    expect(summary).toMatchObject({
      providerSource: "external-http",
      promptVersion: "rules-v1",
      usedFallback: false,
      insightsGenerated: 1
    });
    expect(created[0]!.providerSource).toBe("external-http");
  });

  it("normalizes diagnostic scheduled workload copy before persistence", async () => {
    const created: NewInsight[] = [];
    const provider: IAiInsightProvider = {
      name: "untrusted-external",
      async produceInsights() {
        return [
          {
            insightType: InsightType.BURNOUT_WARNING,
            title: "Burnout disorder detected",
            message: "This confirms a medical diagnosis.",
            confidenceScore: 0.87
          }
        ];
      }
    };
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-1"];
      },
      async createMany(userId, insights, providerSource) {
        created.push(...insights);
        return makeInsights(userId, insights, providerSource);
      }
    });

    await new ScheduledInsightService(repo, provider).run({
      now: new Date("2026-05-23T12:00:00.000Z")
    });

    expect(created).toEqual([
      {
        insightType: InsightType.BURNOUT_WARNING,
        ...NON_DIAGNOSTIC_WORKLOAD_COPY,
        confidenceScore: 0.87
      }
    ]);
  });

  it("records scheduled prompt run history", async () => {
    const runs: unknown[] = [];
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-1"];
      },
      async createPromptRun(promptRun) {
        runs.push(promptRun);
      }
    });

    await new ScheduledInsightService(repo).run({
      now: new Date("2026-05-23T12:00:00.000Z")
    });

    expect(runs).toEqual([
      expect.objectContaining({
        userId: "user-1",
        providerSource: "rule-based",
        promptVersion: "rules-v1",
        promptAudience: "self-directed learners",
        maxInsights: 3,
        usedFallback: false,
        insightCount: 1,
        trigger: "SCHEDULED"
      })
    ]);
  });

  it("skips scheduled users outside the rollout percent", async () => {
    const oldRollout = process.env.AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT;
    process.env.AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT = "0";
    const created: string[] = [];
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-1", "user-2"];
      },
      async createMany(userId, insights, providerSource) {
        created.push(userId);
        return makeInsights(userId, insights, providerSource);
      }
    });

    try {
      const summary = await new ScheduledInsightService(repo).run({
        now: new Date("2026-05-23T12:00:00.000Z")
      });

      expect(summary).toMatchObject({
        usersScanned: 2,
        insightsGenerated: 0,
        usersSkipped: 2
      });
      expect(created).toEqual([]);
    } finally {
      if (oldRollout === undefined) {
        delete process.env.AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT;
      } else {
        process.env.AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT = oldRollout;
      }
    }
  });

  it("blocks scheduled runs when external provider is required but unavailable", async () => {
    const oldRequired = process.env.AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL;
    const oldProvider = process.env.AI_INSIGHT_PROVIDER;
    process.env.AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL = "true";
    process.env.AI_INSIGHT_PROVIDER = "rules";
    const repo = makeRepo({
      async findActiveUserIds() {
        return ["user-1"];
      },
      async createMany() {
        throw new Error("Should not create insights while rollout is blocked");
      }
    });

    try {
      const summary = await new ScheduledInsightService(repo).run({
        now: new Date("2026-05-23T12:00:00.000Z")
      });

      expect(summary).toMatchObject({
        usersScanned: 1,
        insightsGenerated: 0,
        usersSkipped: 1
      });
    } finally {
      if (oldRequired === undefined) {
        delete process.env.AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL;
      } else {
        process.env.AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL = oldRequired;
      }

      if (oldProvider === undefined) {
        delete process.env.AI_INSIGHT_PROVIDER;
      } else {
        process.env.AI_INSIGHT_PROVIDER = oldProvider;
      }
    }
  });

  it("resolves scheduled rollout control metadata", () => {
    expect(
      resolveScheduledInsightRolloutControls({
        AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT: "12",
        AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL: "true",
        AI_INSIGHT_PROVIDER: "external-http",
        AI_INSIGHT_ENDPOINT: "https://example.test/insights"
      } as NodeJS.ProcessEnv)
    ).toEqual({
      rolloutPercent: 12,
      externalProviderRequired: true,
      externalProviderReady: true,
      blockedReason: null
    });
  });

  it("uses stable rollout buckets per user", () => {
    expect(isUserInScheduledRollout("user-1", 100)).toBe(true);
    expect(isUserInScheduledRollout("user-1", 0)).toBe(false);
    expect(isUserInScheduledRollout("user-1", 50)).toBe(isUserInScheduledRollout("user-1", 50));
  });
});
