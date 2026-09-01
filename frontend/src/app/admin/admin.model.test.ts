import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDateTime,
  formatMonitoringTime,
  labelize,
  observabilityClass,
  statusClass,
  summarizeMetadata,
  toEconomyForm
} from "./admin.model";

describe("admin page model", () => {
  it("formats domain labels, byte counts, and economy form values", () => {
    expect(labelize("ACTION_TAKEN")).toBe("Action Taken");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
    expect(toEconomyForm({
      id: "settings-1",
      xpMultiplier: 1.25,
      coinMultiplier: 0.8,
      dailyCoinLimit: 450,
      maxQuestReward: 900,
      inflationRate: 0.05,
      updatedBy: null,
      updatedAt: "2026-08-01T00:00:00.000Z"
    })).toEqual({
      xpMultiplier: "1.25",
      coinMultiplier: "0.8",
      dailyCoinLimit: "450",
      maxQuestReward: "900",
      inflationRate: "0.05"
    });
  });

  it("handles absent or malformed monitoring values without leaking invalid dates", () => {
    expect(formatMonitoringTime("")).toBe("Not sampled");
    expect(formatMonitoringTime("not-a-date")).toBe("Not sampled");
    expect(formatDateTime(null)).toBe("Unknown start time");
    expect(formatDateTime("not-a-date")).toBe("Unknown start time");
    expect(summarizeMetadata(null)).toBe("No metadata");
    expect(summarizeMetadata([])).toBe("No metadata");
  });

  it("keeps status presentation tied to admin domain states", () => {
    expect(statusClass("ACTIVE")).toContain("mint");
    expect(statusClass("SUSPENDED")).toContain("ember");
    expect(statusClass("BANNED")).toContain("ink");
    expect(observabilityClass("ready")).toContain("mint");
    expect(observabilityClass("unreachable")).toContain("ember");
  });
});
