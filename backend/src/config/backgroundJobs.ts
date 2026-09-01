export type BackgroundJobsMode = "manual-runner" | "local-scheduler" | "hosted-scheduler";

export function resolveBackgroundJobsMode(mode = process.env.BACKGROUND_JOBS_MODE): BackgroundJobsMode {
  if (mode === "local-scheduler" || mode === "hosted-scheduler") {
    return mode;
  }

  return "manual-runner";
}
