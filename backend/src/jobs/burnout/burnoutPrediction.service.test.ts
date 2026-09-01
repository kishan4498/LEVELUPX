import { InsightType, type AiInsight } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { NewInsight } from "../../modules/ai-insights/aiInsight.types.js";
import type { IBurnoutPredictionRepository } from "./burnoutPrediction.repository.js";
import { BurnoutPredictionService } from "./burnoutPrediction.service.js";
import type { BurnoutStats } from "./burnoutPrediction.types.js";

function makeInsight(userId: string, insight: NewInsight): AiInsight {
  return {
    id: `${userId}-insight`,
    userId,
    insightType: insight.insightType,
    title: insight.title,
    message: insight.message,
    confidenceScore: insight.confidenceScore,
    providerSource: null,
    feedbackValue: null,
    feedbackComment: null,
    feedbackAt: null,
    generatedAt: new Date("2026-05-20T00:00:00.000Z")
  };
}

describe("BurnoutPredictionService", () => {
  it("classifies burnout risk from activity stats", () => {
    const service = new BurnoutPredictionService({} as IBurnoutPredictionRepository);

    expect(
      service.predict({
        userId: "user-1",
        focusHoursLast3Days: 19,
        failedTaskRateLast7Days: 0.6,
        activeFocusDaysLast7Days: 6
      })
    ).toMatchObject({
      userId: "user-1",
      riskLevel: "HIGH",
      confidenceScore: 0.86
    });

    expect(
      service.predict({
        userId: "user-2",
        focusHoursLast3Days: 4,
        failedTaskRateLast7Days: 0.1,
        activeFocusDaysLast7Days: 2
      })
    ).toBeNull();
  });

  it("creates non-diagnostic workload guidance for high-activity rule matches", async () => {
    const created: { userId: string; insight: NewInsight }[] = [];
    const stats = new Map<string, BurnoutStats>([
      [
        "high-risk",
        {
          userId: "high-risk",
          focusHoursLast3Days: 20,
          failedTaskRateLast7Days: 0.55,
          activeFocusDaysLast7Days: 7
        }
      ],
      [
        "steady",
        {
          userId: "steady",
          focusHoursLast3Days: 5,
          failedTaskRateLast7Days: 0.1,
          activeFocusDaysLast7Days: 2
        }
      ]
    ]);
    const repo: IBurnoutPredictionRepository = {
      async findActiveUserIds() {
        return ["high-risk", "steady"];
      },
      async getUserStats(range) {
        return stats.get(range.userId)!;
      },
      async getFeedbackSignal() {
        return {
          hasRecentWarning: false,
          hasRecentNegativeFeedback: false
        };
      },
      async createInsight(userId, insight) {
        created.push({ userId, insight });
        return makeInsight(userId, insight);
      }
    };

    const summary = await new BurnoutPredictionService(repo).run({
      now: new Date("2026-05-20T00:00:00.000Z")
    });

    expect(summary).toEqual({
      usersScanned: 2,
      insightsCreated: 1,
      highRiskUsers: 1,
      mediumRiskUsers: 0,
      duplicateWarningsSkipped: 0,
      feedbackSuppressedUsers: 0
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      userId: "high-risk",
      insight: {
        insightType: InsightType.BURNOUT_WARNING,
        title: "high workload strain signal",
        message: expect.stringContaining("not a medical assessment"),
        confidenceScore: 0.86
      }
    });
  });

  it("skips duplicate burnout warnings created recently", async () => {
    let created = false;
    const repo: IBurnoutPredictionRepository = {
      async findActiveUserIds() {
        return ["high-risk"];
      },
      async getUserStats() {
        return {
          userId: "high-risk",
          focusHoursLast3Days: 20,
          failedTaskRateLast7Days: 0.55,
          activeFocusDaysLast7Days: 7
        };
      },
      async getFeedbackSignal() {
        return {
          hasRecentWarning: true,
          hasRecentNegativeFeedback: false
        };
      },
      async createInsight() {
        created = true;
        throw new Error("Should not create a duplicate warning");
      }
    };

    const summary = await new BurnoutPredictionService(repo).run({
      now: new Date("2026-05-20T00:00:00.000Z")
    });

    expect(created).toBe(false);
    expect(summary).toMatchObject({
      insightsCreated: 0,
      duplicateWarningsSkipped: 1,
      feedbackSuppressedUsers: 0
    });
  });

  it("suppresses burnout warnings after recent negative feedback", async () => {
    let created = false;
    const repo: IBurnoutPredictionRepository = {
      async findActiveUserIds() {
        return ["high-risk"];
      },
      async getUserStats() {
        return {
          userId: "high-risk",
          focusHoursLast3Days: 20,
          failedTaskRateLast7Days: 0.55,
          activeFocusDaysLast7Days: 7
        };
      },
      async getFeedbackSignal(window) {
        expect(window.negativeFeedbackFrom.toISOString()).toBe("2026-05-06T00:00:00.000Z");
        return {
          hasRecentWarning: false,
          hasRecentNegativeFeedback: true
        };
      },
      async createInsight() {
        created = true;
        throw new Error("Should not create a warning after negative feedback");
      }
    };

    const summary = await new BurnoutPredictionService(repo).run({
      now: new Date("2026-05-20T00:00:00.000Z")
    });

    expect(created).toBe(false);
    expect(summary).toMatchObject({
      insightsCreated: 0,
      duplicateWarningsSkipped: 0,
      feedbackSuppressedUsers: 1
    });
  });
});
