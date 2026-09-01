import { describe, expect, it, vi } from "vitest";

import type { IProductEventRepository } from "./productEvent.repository.js";
import { ProductEventService } from "./productEvent.service.js";

describe("ProductEventService", () => {
  it("calculates unique-user conversion between ordered funnel steps", async () => {
    const repo: IProductEventRepository = {
      create: vi.fn(),
      aggregate: vi.fn().mockResolvedValue([
        { name: "onboarding_started", events: 12, uniqueUsers: 10 },
        { name: "onboarding_completed", events: 8, uniqueUsers: 8 },
        { name: "quest_created", events: 9, uniqueUsers: 6 },
        { name: "quest_completed", events: 5, uniqueUsers: 3 },
        { name: "focus_completed", events: 3, uniqueUsers: 2 }
      ])
    };
    const now = new Date("2026-08-04T12:00:00.000Z");
    const service = new ProductEventService(repo, () => now);

    const funnel = await service.funnel();

    expect(funnel.steps.map((step) => step.conversionFromPrevious)).toEqual([
      null,
      80,
      75,
      50,
      66.7
    ]);
    expect(funnel.to).toBe(now.toISOString());
  });
});
