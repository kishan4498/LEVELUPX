# Background Jobs

LevelUpX has a shared job registry that can run from a CLI, the Docker local
scheduler, or a hosted scheduler. Jobs emit structured summaries and use Redis
distributed locks when that purpose is enabled.

## Registered Jobs

| Job | Purpose | Local cadence |
| --- | --- | --- |
| `quest-reminders` | Sends due reminders while honoring preferences and quiet hours | 5 minutes |
| `leaderboard-refresh` | Refreshes global and guild snapshots | 15 minutes |
| `daily-digest` | Sends a daily briefing after 08:00 in each user's timezone | 1 hour |
| `weekly-team-quests` | Materializes each due recurring guild quest with a series/week uniqueness guard | 1 hour |
| `scheduled-insights` | Generates missing or stale productivity insights | 12 hours |
| `burnout-prediction` | Stores rule-based overload warnings | 24 hours |
| `weekly-report` | Generates the platform progress report and delivery record | 7 days |

The reminder, leaderboard, digest, and weekly-team-quest jobs run once when the local scheduler starts. A per-job in-process
guard prevents overlapping local runs, while Redis locks protect against
multiple workers.

## Commands

```powershell
cd backend
npm run jobs:run -- --list
npm run jobs:run
npm run jobs:run -- quest-reminders daily-digest
npm run jobs:schedule
npm run jobs:local
```

An unknown job name or failed job produces a non-zero exit code. Jobs selected
in one CLI invocation run sequentially so logs and failure ownership remain
clear.

## Docker

`docker compose up` starts a dedicated `scheduler` container that reuses the
backend image and runs `dist/jobs/localScheduler.js`. It has no public port.

```powershell
docker compose logs -f scheduler
```

The API health response reports `backgroundJobs.mode=local-scheduler` for this
configuration.

## Hosted Scheduling

Set `BACKGROUND_JOBS_MODE=hosted-scheduler`,
`HOSTED_SCHEDULER_ENABLED=true`, and configure the UTC cron values documented
in `docs/environment.md`. Run one explicit job per platform schedule. Do not
leave the local scheduler active when hosted schedules own the same jobs.

Recommended hosted commands:

```powershell
npm run jobs:run -- quest-reminders
npm run jobs:run -- leaderboard-refresh
npm run jobs:run -- daily-digest
npm run jobs:run -- weekly-team-quests
npm run jobs:run -- scheduled-insights
npm run jobs:run -- burnout-prediction
npm run jobs:run -- weekly-report
```

## Recovery

- Read the failed job name and error from the structured summary.
- Confirm database, Redis, provider, and storage connectivity.
- Re-run only the failed job after correcting the cause.
- Check notification preferences and quiet-hour calculations before replaying
  reminder or digest delivery.
- Avoid repeated weekly-report runs unless an extra report record is intended.

Weekly delivery details are in `docs/weekly-report-delivery.md`; Redis locking
behavior is in `docs/redis-runtime.md`.
