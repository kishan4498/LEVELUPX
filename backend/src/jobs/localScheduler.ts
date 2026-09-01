import { getJobsByName } from "./registry.js";
import { runJobs } from "./jobRunner.js";

type LocalSchedule = {
  name: string;
  intervalMs: number;
  runOnStartup: boolean;
};

const SCHEDULES: LocalSchedule[] = [
  { name: "quest-reminders", intervalMs: 5 * 60_000, runOnStartup: true },
  { name: "leaderboard-refresh", intervalMs: 15 * 60_000, runOnStartup: true },
  { name: "daily-digest", intervalMs: 60 * 60_000, runOnStartup: true },
  { name: "weekly-team-quests", intervalMs: 60 * 60_000, runOnStartup: true },
  { name: "scheduled-insights", intervalMs: 12 * 60 * 60_000, runOnStartup: false },
  { name: "burnout-prediction", intervalMs: 24 * 60 * 60_000, runOnStartup: false },
  { name: "weekly-report", intervalMs: 7 * 24 * 60 * 60_000, runOnStartup: false }
];

const RUNNING = new Set<string>();
const TIMERS: NodeJS.Timeout[] = [];

async function runScheduled(name: string) {
  if (RUNNING.has(name)) {
    console.warn(`Skipping overlapping local job run: ${name}`);
    return;
  }

  const { jobs } = getJobsByName([name]);
  const job = jobs[0];

  if (!job) {
    console.error(`Local scheduler could not find job: ${name}`);
    return;
  }

  RUNNING.add(name);

  try {
    const summary = await runJobs([job], { logLevel: "info" });
    console.log(JSON.stringify({ scheduler: "local", ...summary }));
  } finally {
    RUNNING.delete(name);
  }
}

for (const schedule of SCHEDULES) {
  if (schedule.runOnStartup) {
    void runScheduled(schedule.name);
  }

  TIMERS.push(
    setInterval(() => {
      void runScheduled(schedule.name);
    }, schedule.intervalMs)
  );
}

console.log(
  JSON.stringify({
    scheduler: "local",
    status: "started",
    jobs: SCHEDULES.map((schedule) => ({
      name: schedule.name,
      intervalMinutes: schedule.intervalMs / 60_000
    }))
  })
);

function shutdown(signal: string) {
  for (const timer of TIMERS) {
    clearInterval(timer);
  }

  console.log(JSON.stringify({ scheduler: "local", status: "stopped", signal }));
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
