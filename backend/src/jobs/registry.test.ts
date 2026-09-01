import { describe, expect, it } from "vitest";
import { getJobsByName, registeredJobs } from "./registry.js";

describe("job registry", () => {
  it("registers the planned background jobs", () => {
    expect(registeredJobs.map((job) => job.name)).toEqual([
      "weekly-report",
      "leaderboard-refresh",
      "burnout-prediction",
      "scheduled-insights",
      "quest-reminders",
      "daily-digest",
      "weekly-team-quests"
    ]);
  });

  it("returns selected jobs and unknown names", () => {
    const selection = getJobsByName(["weekly-report", "missing-job"]);

    expect(selection.jobs.map((job) => job.name)).toEqual(["weekly-report"]);
    expect(selection.unknownNames).toEqual(["missing-job"]);
  });
});
