import { QuestStatus, type FocusSession, type Quest, type XpTransaction } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { IAnalyticsRepository } from "./analytics.repository.js";
import { AnalyticsService } from "./analytics.service.js";
import type { IAnalyticsRecommendationProvider } from "./analyticsRecommendation.provider.js";

const now = new Date();

function makeQuest(status: QuestStatus): Quest {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    title: "Quest",
    description: "Quest description",
    projectId: null,
    parentQuestId: null,
    recurrenceSourceId: null,
    difficulty: "EASY",
    priority: "MEDIUM",
    category: "learning",
    tags: [],
    estimatedMinutes: 25,
    status,
    dueDate: null,
    recurrence: "NONE",
    reminderAt: null,
    reminderSentAt: null,
    clientRequestId: null,
    xpReward: 10,
    coinReward: 5,
    createdAt: now,
    updatedAt: now
  };
}

function makeXp(amount: number): XpTransaction {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    sourceType: "QUEST",
    sourceId: "quest-1",
    amount,
    multiplier: 1,
    reason: "Quest completed",
    createdAt: now
  };
}

function makeFocus(durationMinutes: number): FocusSession {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    questId: null,
    targetMinutes: 25,
    goal: null,
    startTime: now,
    endTime: now,
    durationMinutes,
    sessionType: "DEEP_WORK",
    completed: true,
    pausedAt: null,
    pausedSeconds: 0,
    distractionNote: null
  };
}

function repo(): IAnalyticsRepository {
  return {
    async findQuestsInWindow() {
      return [makeQuest(QuestStatus.COMPLETED), makeQuest(QuestStatus.FAILED)];
    },
    async findXpTransactionsInWindow() {
      return [makeXp(30)];
    },
    async findFocusSessionsInWindow() {
      return [makeFocus(25)];
    }
  };
}

describe("AnalyticsService recommendations", () => {
  it("returns provider-backed recommendations with metadata", async () => {
    const provider: IAnalyticsRecommendationProvider = {
      name: "external-http",
      async generate(metrics) {
        expect(metrics.summary.completedQuests).toBe(1);
        expect(metrics.consistency.activeDays).toBeGreaterThan(0);
        return ["Provider move one", "Provider move two"];
      }
    };

    await expect(new AnalyticsService(repo(), provider, undefined, "analytics-external-v1").fetchAnalyticsRecommendations("user-1")).resolves.toMatchObject({
      recommendations: ["Provider move one", "Provider move two"],
      meta: {
        providerSource: "external-http",
        promptVersion: "analytics-external-v1",
        usedFallback: false
      }
    });
  });

  it("falls back to rules when provider-backed recommendations fail", async () => {
    const provider: IAnalyticsRecommendationProvider = {
      name: "external-http",
      async generate() {
        throw new Error("provider unavailable");
      }
    };

    const report = await new AnalyticsService(repo(), provider).fetchAnalyticsRecommendations("user-1");

    expect(report.meta).toMatchObject({
      providerSource: "rule-based",
      promptVersion: "analytics-rules-v1",
      usedFallback: true
    });
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});
