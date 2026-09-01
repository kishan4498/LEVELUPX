import { runJobs } from "./jobRunner.js";
import { getJobsByName, registeredJobs } from "./registry.js";
import type { LogLevel } from "../common/logger/logger.js";

const LOG_LEVELS = new Set(["debug", "info", "warn", "error", "silent"]);

function readLogLevel(rawLevel: string | undefined): LogLevel {
  if (rawLevel && LOG_LEVELS.has(rawLevel)) {
    return rawLevel as LogLevel;
  }

  return "info";
}

function printJobList() {
  for (const job of registeredJobs) {
    console.log(`${job.name} - ${job.description}`);
  }
}

async function main() {
  const requested = process.argv.slice(2);

  if (requested.includes("--list")) {
    printJobList();
    return;
  }

  const names = requested.length > 0 ? requested : registeredJobs.map((job) => job.name);
  const { jobs, unknownNames } = getJobsByName(names);

  if (unknownNames.length > 0) {
    console.error(`Unknown job name(s): ${unknownNames.join(", ")}`);
    console.error("Run `npm run jobs:run -- --list` to see available jobs.");
    process.exitCode = 1;
    return;
  }

  const summary = await runJobs(jobs, {
    logLevel: readLogLevel(process.env.LOG_LEVEL)
  });

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
