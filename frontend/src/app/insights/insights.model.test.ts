import { describe, expect, it } from "vitest";

import type { AiInsight } from "@/types/insight";

import {
  getNextWindow,
  groupInsights,
  providerLabel,
  replaceInsight,
  riskClass,
  strategyLabel
} from "./insights.model";

const insight = (id: string, generatedAt: string): AiInsight => ({
  id,
  insightType: "STUDY_SUGGESTION",
  title: `Insight ${id}`,
  message: "Review the hardest topic first.",
  confidenceScore: 0.8,
  feedbackValue: null,
  feedbackComment: null,
  feedbackAt: null,
  generatedAt,
  providerSource: "rule-based"
});

describe("insights page model", () => {
  it("groups insight history by local calendar day without reordering entries", () => {
    const first = insight("one", "2026-08-01T08:00:00.000Z");
    const second = insight("two", "2026-08-01T12:00:00.000Z");
    const third = insight("three", "2026-08-03T08:00:00.000Z");

    const groups = groupInsights([first, second, third]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.insights).toEqual([first, second]);
    expect(groups[1]?.insights).toEqual([third]);
  });

  it("replaces only the matching insight after feedback is saved", () => {
    const first = insight("one", "2026-08-01T08:00:00.000Z");
    const second = insight("two", "2026-08-02T08:00:00.000Z");
    const saved = { ...first, feedbackValue: "HELPFUL" as const };

    const result = replaceInsight([first, second], saved);

    expect(result).toEqual([saved, second]);
    expect(result[1]).toBe(second);
  });

  it("keeps provider, strategy, risk, and schedule labels predictable at boundaries", () => {
    expect(providerLabel(null)).toBe("rule based");
    expect(providerLabel("external-http")).toBe("external http");
    expect(strategyLabel("DEADLINE_PUSH")).toBe("deadline push");
    expect(riskClass("HIGH")).toContain("ember");

    const beforeMorningRun = new Date(2026, 7, 1, 5, 30);
    const expected = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(2026, 7, 1, 6, 0));
    expect(getNextWindow(beforeMorningRun)).toBe(expected);
  });
});
