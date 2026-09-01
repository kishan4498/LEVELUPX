import { describe, expect, it } from "vitest";

import { rewardHistoryQuerySchema } from "./reward.validation.js";

describe("reward history validation", () => {
  it("applies pagination defaults", () => {
    expect(rewardHistoryQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20
    });
  });

  it("coerces pagination query strings", () => {
    expect(
      rewardHistoryQuerySchema.parse({
        page: "2",
        limit: "10"
      })
    ).toEqual({
      page: 2,
      limit: 10
    });
  });

  it("rejects oversized limits", () => {
    expect(
      rewardHistoryQuerySchema.safeParse({
        page: "1",
        limit: "500"
      }).success
    ).toBe(false);
  });
});
