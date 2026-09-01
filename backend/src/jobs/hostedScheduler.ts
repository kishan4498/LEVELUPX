import type { Job } from "./job.types.js";

export type HostedSchedulerJobPlan = {
  name: string;
  description: string;
  command: string;
  cronUtc: string;
  cadence: string;
  configuredEnabled: boolean;
  effectiveEnabled: boolean;
};

export type HostedSchedulerPlan = {
  provider: string | null;
  timezone: string;
  schedulerEnabled: boolean;
  runMode: "separate-jobs";
  jobs: HostedSchedulerJobPlan[];
  notes: string[];
};

type ScheduleDefault = {
  cronUtc: string;
  cadence: string;
};

const DEFAULT_SCHEDULES = new Map<string, ScheduleDefault>([
  ["leaderboard-refresh", { cronUtc: "*/15 * * * *", cadence: "Every 15 minutes" }],
  ["burnout-prediction", { cronUtc: "0 2 * * *", cadence: "Daily at 02:00 UTC" }],
  ["scheduled-insights", { cronUtc: "0 6,18 * * *", cadence: "Twice daily at 06:00 and 18:00 UTC" }],
  ["quest-reminders", { cronUtc: "*/5 * * * *", cadence: "Every 5 minutes" }],
  ["daily-digest", { cronUtc: "0 * * * *", cadence: "Hourly for timezone-aware delivery" }],
  ["weekly-team-quests", { cronUtc: "5 * * * *", cadence: "Hourly at five minutes past" }],
  ["weekly-report", { cronUtc: "0 8 * * 1", cadence: "Weekly on Monday at 08:00 UTC" }]
]);

export function resolveHostedSchedulerPlan(
  env: NodeJS.ProcessEnv = process.env,
  jobs: Pick<Job, "name" | "description">[]
): HostedSchedulerPlan {
  const enabled = readBoolean(env.HOSTED_SCHEDULER_ENABLED);
  const provider = optional(env.HOSTED_SCHEDULER_PROVIDER) ?? null;
  const timezone = optional(env.HOSTED_SCHEDULER_TIMEZONE) ?? "UTC";

  return {
    provider,
    timezone,
    schedulerEnabled: enabled,
    runMode: "separate-jobs",
    jobs: jobs.map((job) => {
      const prefix = `JOB_SCHEDULE_${toEnvKey(job.name)}`;
      const defaults = DEFAULT_SCHEDULES.get(job.name) ?? { cronUtc: "0 * * * *", cadence: "Hourly" };
      const configured = readBoolean(env[`${prefix}_ENABLED`] ?? "true");

      return {
        name: job.name,
        description: job.description,
        command: `npm run jobs:run -- ${job.name}`,
        cronUtc: optional(env[`${prefix}_CRON_UTC`]) ?? defaults.cronUtc,
        cadence: optional(env[`${prefix}_CADENCE`]) ?? defaults.cadence,
        configuredEnabled: configured,
        effectiveEnabled: enabled && configured
      };
    }),
    notes: [
      "Install each enabled job as a separate hosted scheduler entry.",
      "Keep only one hosted scheduler responsible for a job until distributed locking is added.",
      "The command exits non-zero when a selected job fails, so hosted scheduler retries can rely on process status."
    ]
  };
}

function readBoolean(raw: string | undefined) {
  return raw === "true" || raw === "1";
}

function optional(raw: string | undefined) {
  return raw?.trim() || undefined;
}

function toEnvKey(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
