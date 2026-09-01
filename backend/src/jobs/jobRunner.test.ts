import { describe, expect, it } from "vitest";
import { runJobs } from "./jobRunner.js";
import type { Job } from "./job.types.js";

describe("runJobs", () => {
  it("runs jobs and returns a summary", async () => {
    const job: Job = {
      name: "test-job",
      description: "A test job",
      async run() {
        return {
          name: "test-job",
          status: "completed",
          message: "done"
        };
      }
    };

    const summary = await runJobs([job], {
      logLevel: "silent",
      startedAt: new Date("2026-05-19T00:00:00.000Z")
    });

    expect(summary.total).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results[0]).toMatchObject({
      name: "test-job",
      status: "completed"
    });
  });

  it("captures job failures without stopping later jobs", async () => {
    const failingJob: Job = {
      name: "failing-job",
      description: "A failing test job",
      async run() {
        throw new Error("boom");
      }
    };
    const passingJob: Job = {
      name: "passing-job",
      description: "A passing test job",
      async run() {
        return {
          name: "passing-job",
          status: "completed",
          message: "done"
        };
      }
    };

    const summary = await runJobs([failingJob, passingJob], {
      logLevel: "silent"
    });

    expect(summary.total).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results[0]).toMatchObject({
      name: "failing-job",
      status: "failed",
      error: "boom"
    });
    expect(summary.results[1]).toMatchObject({
      name: "passing-job",
      status: "completed"
    });
  });
});
