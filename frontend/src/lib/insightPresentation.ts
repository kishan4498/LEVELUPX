import type { AiInsight, InsightType } from "@/types/insight";

export const NON_DIAGNOSTIC_WORKLOAD_COPY = {
  title: "Workload recovery signal",
  message: "Recent activity shows a heavier workload pattern. This productivity guidance is not a medical assessment; consider a recovery quest or a lighter session."
} as const;

export function guidanceScorePercent(score: number) {
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

export function guidanceScoreLabel(providerSource: string | null | undefined) {
  return !providerSource || providerSource === "rule-based"
    ? "Rule-assigned score"
    : "Provider score";
}

export function presentInsightTitle(insight: Pick<AiInsight, "insightType" | "title">) {
  if (insight.insightType === "BURNOUT_WARNING") {
    // Existing rows may retain external or legacy copy; never present it as a diagnosis.
    return NON_DIAGNOSTIC_WORKLOAD_COPY.title;
  }

  return insight.title;
}

export function presentInsightMessage(insight: Pick<AiInsight, "insightType" | "message">) {
  return insight.insightType === "BURNOUT_WARNING"
    ? NON_DIAGNOSTIC_WORKLOAD_COPY.message
    : insight.message;
}

export function insightTypeLabel(insightType: InsightType) {
  return insightType === "BURNOUT_WARNING" ? "Workload" : null;
}
