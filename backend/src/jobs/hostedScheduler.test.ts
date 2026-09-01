import { describe, expect, it } from "vitest";

import { resolveHostedSchedulerPlan } from "./hostedScheduler.js";
import type { Job } from "./job.types.js";

const jobs: Pick<Job, "name" | "description">[] = [
  {
    name: "leaderboard-refresh",
    description: "Refresh leaderboard snapshots."
  },
  {
    name: "weekly-report",
    description: "Generate a weekly platform report."
  }
];

describe("resolveHostedSchedulerPlan", () => {
  it("returns disabled hosted schedule entries by default", () => {
    expect(resolveHostedSchedulerPlan({}, jobs)).toMatchObject({
      provider: null,
      timezone: "UTC",
      schedulerEnabled: false,
      runMode: "separate-jobs",
      jobs: [
        {
          name: "leaderboard-refresh",
          command: "npm run jobs:run -- leaderboard-refresh",
          cronUtc: "*/15 * * * *",
          cadence: "Every 15 minutes",
          configuredEnabled: true,
          effectiveEnabled: false
        },
        {
          name: "weekly-report",
          command: "npm run jobs:run -- weekly-report",
          cronUtc: "0 8 * * 1",
          cadence: "Weekly on Monday at 08:00 UTC",
          configuredEnabled: true,
          effectiveEnabled: false
        }
      ]
    });
  });

  it("applies hosted provider and per-job schedule overrides", () => {
    expect(
      resolveHostedSchedulerPlan(
        {
          HOSTED_SCHEDULER_ENABLED: "true",
          HOSTED_SCHEDULER_PROVIDER: "platform-cron",
          HOSTED_SCHEDULER_TIMEZONE: "Asia/Calcutta",
          JOB_SCHEDULE_LEADERBOARD_REFRESH_CRON_UTC: "*/10 * * * *",
          JOB_SCHEDULE_LEADERBOARD_REFRESH_CADENCE: "Every 10 minutes",
          JOB_SCHEDULE_WEEKLY_REPORT_ENABLED: "false"
        },
        jobs
      )
    ).toMatchObject({
      provider: "platform-cron",
      timezone: "Asia/Calcutta",
      schedulerEnabled: true,
      jobs: [
        {
          name: "leaderboard-refresh",
          cronUtc: "*/10 * * * *",
          cadence: "Every 10 minutes",
          configuredEnabled: true,
          effectiveEnabled: true
        },
        {
          name: "weekly-report",
          configuredEnabled: false,
          effectiveEnabled: false
        }
      ]
    });
  });
});
