export type JobStatus = "completed" | "skipped" | "failed";

export type JobCtx = {
  startedAt: Date;
};

export type JobOk = {
  name: string;
  status: Exclude<JobStatus, "failed">;
  message: string;
  metadata?: Record<string, unknown>;
};

export type JobFail = {
  name: string;
  status: "failed";
  message: string;
  error: string;
};

export type RunResult = JobOk | JobFail;

export type Job = {
  name: string;
  description: string;
  run(ctx: JobCtx): Promise<JobOk>;
};
