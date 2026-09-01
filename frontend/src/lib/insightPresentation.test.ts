import { describe, expect, it } from "vitest";

import {
  guidanceScoreLabel,
  guidanceScorePercent,
  insightTypeLabel,
  presentInsightMessage,
  presentInsightTitle
} from "./insightPresentation";

describe("insight presentation", () => {
  it("presents rule values as assigned guidance scores rather than probabilities", () => {
    expect(guidanceScoreLabel(null)).toBe("Rule-assigned score");
    expect(guidanceScoreLabel("rule-based")).toBe("Rule-assigned score");
    expect(guidanceScoreLabel("external-http")).toBe("Provider score");
    expect(guidanceScorePercent(0.824)).toBe(82);
  });

  it("normalizes diagnostic workload warning copy without changing the wire enum", () => {
    expect(
      presentInsightTitle({
        insightType: "BURNOUT_WARNING",
        title: "Clinical burnout diagnosis"
      })
    ).toBe("Workload recovery signal");
    expect(
      presentInsightMessage({
        insightType: "BURNOUT_WARNING",
        message: "You have a medical condition and need treatment."
      })
    ).toBe(
      "Recent activity shows a heavier workload pattern. This productivity guidance is not a medical assessment; consider a recovery quest or a lighter session."
    );
    expect(insightTypeLabel("BURNOUT_WARNING")).toBe("Workload");
  });

  it("preserves copy for non-workload insight types", () => {
    expect(
      presentInsightMessage({
        insightType: "STUDY_SUGGESTION",
        message: "Review the hardest topic first."
      })
    ).toBe("Review the hardest topic first.");
  });
});
