# LevelUpX Environment Guide

Do not commit real secrets. The repository keeps only example files.

## Local Backend

Copy the backend example file:

```bash
copy backend\.env.example backend\.env
```

For production planning, start from:

```bash
copy backend\.env.production.example backend\.env.production
```

Required backend variables:

- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: backend HTTP port, usually `4000`.
- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_ACCESS_SECRET`: at least 32 random characters.
- `JWT_REFRESH_SECRET`: at least 32 random characters and different from the access secret.
- `RATE_LIMIT_WINDOW_MS`: general mutation rate-limit window in milliseconds.
- `RATE_LIMIT_MAX_REQUESTS`: max mutation requests per window.
- `AUTH_RATE_LIMIT_WINDOW_MS`: auth route rate-limit window in milliseconds.
- `AUTH_RATE_LIMIT_MAX_REQUESTS`: max auth attempts per window.
- `LOG_LEVEL`: `debug`, `info`, `warn`, `error`, or `silent`.
- `REPORT_STORAGE_DIR`: local report output directory.
- `WEEKLY_REPORT_DELIVERY_ENABLED`: set `true` only when weekly report delivery should attempt sending.
- `WEEKLY_REPORT_DELIVERY_PROVIDER`: `email` for SMTP/API sending or `local-outbox` for local delivery tests.
- `WEEKLY_REPORT_EMAIL_PROVIDER`: `smtp` or `api` for external email delivery.
- `WEEKLY_REPORT_RECIPIENT_EMAILS`: comma-separated admin recipients for weekly reports.
- `WEEKLY_REPORT_EMAIL_FROM`: sender address for external email delivery.
- `WEEKLY_REPORT_SMTP_HOST`: SMTP host for email delivery.
- `WEEKLY_REPORT_SMTP_PORT`: SMTP port for email delivery.
- `WEEKLY_REPORT_SMTP_SECURE`: set `true` for implicit TLS, usually port `465`.
- `WEEKLY_REPORT_SMTP_USERNAME`: SMTP username for email delivery.
- `WEEKLY_REPORT_SMTP_PASSWORD`: SMTP password or app token for email delivery.
- `WEEKLY_REPORT_API_ENDPOINT`: email API endpoint for provider delivery.
- `WEEKLY_REPORT_API_KEY`: email API key for provider delivery.
- `WEEKLY_REPORT_DELIVERY_TIMEOUT_MS`: SMTP/API delivery timeout in milliseconds.
- `WEEKLY_REPORT_DELIVERY_MAX_ATTEMPTS`: bounded report delivery attempts, clamped to 1-5.
- `WEEKLY_REPORT_DELIVERY_OUTBOX_DIR`: required only for `local-outbox` weekly report delivery.
- `ROOT_SUPER_ADMIN_EMAIL`: fixed owner identity that can activate only after email possession is verified; it cannot be demoted in the admin UI.
- `AUTH_EMAIL_DELIVERY_ENABLED`: set `true` when email verification, password reset, and two-step messages should be sent.
- `AUTH_EMAIL_PROVIDER`: `smtp`, `api`, or `local-outbox`.
- `AUTH_EMAIL_FROM`: sender address for account security emails.
- `AUTH_EMAIL_SMTP_HOST`: SMTP host for account security emails.
- `AUTH_EMAIL_SMTP_PORT`: SMTP port for account security emails.
- `AUTH_EMAIL_SMTP_SECURE`: set `true` for implicit TLS, usually port `465`.
- `AUTH_EMAIL_SMTP_USERNAME`: SMTP username for account security emails.
- `AUTH_EMAIL_SMTP_PASSWORD`: SMTP password or app token for account security emails.
- `AUTH_EMAIL_API_ENDPOINT`: email API endpoint for account security emails.
- `AUTH_EMAIL_API_KEY`: email API key for account security emails.
- `AUTH_EMAIL_OUTBOX_DIR`: local outbox directory for account security email testing.
- `AUTH_EMAIL_TIMEOUT_MS`: account security email delivery timeout.
- `AUTH_EMAIL_PRINT_CODES_TO_CONSOLE`: explicit emergency bootstrap fallback; defaults to and should remain `false`.
- `AUTH_DEV_DISCLOSE_CODES`: test-only opt-in for returning generated auth secrets; keep `false` outside focused unit tests and always in production.
- `AI_INSIGHT_PROVIDER`: `rules` by default, or `external-http` when a provider endpoint is configured.
- `AI_INSIGHT_ENDPOINT`: external AI insight endpoint when using `external-http`.
- `AI_INSIGHT_API_KEY`: external AI insight credential when needed.
- `AI_INSIGHT_EXTERNAL_PROVIDER_NAME`: hosted external AI profile name sent in provider metadata.
- `AI_INSIGHT_EXTERNAL_AUTH_HEADER`: HTTP header used for the external AI credential.
- `AI_INSIGHT_EXTERNAL_AUTH_SCHEME`: auth scheme prefix for the external AI credential, or `none` for a raw header value.
- `AI_INSIGHT_TIMEOUT_MS`: planned external AI timeout in milliseconds.
- `AI_INSIGHT_PROMPT_VERSION`: rule or prompt version label returned in insight generation metadata.
- `AI_INSIGHT_PROMPT_AUDIENCE`: audience/context label sent to external AI insight providers.
- `AI_INSIGHT_MAX_INSIGHTS`: maximum external AI insights to request and accept, clamped to 1-5.
- `AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT`: percent of active users eligible for scheduled AI insights.
- `AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL`: block scheduled AI insights unless external provider config is ready.
- `HOSTED_SCHEDULER_ENABLED`: set `true` only after hosted scheduler entries are installed.
- `HOSTED_SCHEDULER_PROVIDER`: label for the external scheduler provider or platform.
- `HOSTED_SCHEDULER_TIMEZONE`: scheduler display timezone; cron values stay UTC.
- `BACKGROUND_JOBS_MODE`: monitoring label for `manual-runner`, `local-scheduler`, or `hosted-scheduler`.
- `JOB_SCHEDULE_LEADERBOARD_REFRESH_ENABLED`: include leaderboard refresh in hosted schedule output.
- `JOB_SCHEDULE_LEADERBOARD_REFRESH_CRON_UTC`: UTC cron for leaderboard refresh.
- `JOB_SCHEDULE_BURNOUT_PREDICTION_ENABLED`: include burnout prediction in hosted schedule output.
- `JOB_SCHEDULE_BURNOUT_PREDICTION_CRON_UTC`: UTC cron for burnout prediction.
- `JOB_SCHEDULE_SCHEDULED_INSIGHTS_ENABLED`: include scheduled AI insights in hosted schedule output.
- `JOB_SCHEDULE_SCHEDULED_INSIGHTS_CRON_UTC`: UTC cron for scheduled AI insights.
- `JOB_SCHEDULE_QUEST_REMINDERS_ENABLED`: include due-quest reminders in hosted schedule output.
- `JOB_SCHEDULE_QUEST_REMINDERS_CRON_UTC`: UTC cron for due-quest reminders.
- `JOB_SCHEDULE_DAILY_DIGEST_ENABLED`: include timezone-aware daily briefings in hosted schedule output.
- `JOB_SCHEDULE_DAILY_DIGEST_CRON_UTC`: UTC cron used to scan for due daily briefings.
- `JOB_SCHEDULE_WEEKLY_TEAM_QUESTS_ENABLED`: include recurring guild-quest materialization in hosted schedule output.
- `JOB_SCHEDULE_WEEKLY_TEAM_QUESTS_CRON_UTC`: UTC cron used to materialize due weekly team-quest instances.
- `JOB_SCHEDULE_WEEKLY_REPORT_ENABLED`: include weekly report generation in hosted schedule output.
- `JOB_SCHEDULE_WEEKLY_REPORT_CRON_UTC`: UTC cron for weekly report generation.
- `PUSH_DELIVERY_PROVIDER`: `disabled` by default or `web-push` when VAPID delivery is configured.
- `PUSH_VAPID_PUBLIC_KEY`: public VAPID key used by the backend provider config.
- `PUSH_VAPID_PRIVATE_KEY`: secret VAPID private key for future backend web-push delivery.
- `PUSH_VAPID_SUBJECT`: contact URI for future web-push delivery, such as `mailto:admin@example.com`.
- `REDIS_ENABLED`: set `true` only when a real Redis service is available.
- `REDIS_URL`: Redis connection string for shared rate limits, job queue primitives, distributed locks, and leaderboard cache.
- `REDIS_NAMESPACE`: key prefix for this app and environment.
- `REDIS_PURPOSES`: comma-separated Redis use cases planned for this deployment.
- `SERVICE_NAME`: stable backend service name for logs and future monitoring.
- `RELEASE_VERSION`: release id or build version for deployment traceability.
- `ERROR_TRACKING_ENABLED`: enable configured Sentry capture.
- `ERROR_TRACKING_PROVIDER`: `none` or `sentry`.
- `ERROR_TRACKING_DSN`: Sentry DSN when error tracking is enabled.
- `METRICS_ENABLED`: enable the protected Prometheus metrics endpoint.
- `METRICS_PROVIDER`: `none` or `prometheus`.
- `METRICS_PATH`: metrics endpoint path, usually `/metrics`.
- `METRICS_AUTH_TOKEN`: direct bearer secret for Prometheus scraping; minimum 32 characters.
- `METRICS_AUTH_TOKEN_FILE`: mounted bearer-secret file used instead of a direct value.
- `PROMETHEUS_URL`: backend-visible Prometheus URL used for super-admin history.
- `PROMETHEUS_PUBLIC_URL`: validated browser link shown to super admins.
- `GRAFANA_PUBLIC_URL`: validated dashboard link shown to super admins.
- `ALERTMANAGER_PUBLIC_URL`: validated Alertmanager link shown to super admins.
- `OBSERVABILITY_QUERY_TIMEOUT_MS`: Prometheus API timeout, bounded from 500 to 10,000 milliseconds.

Generate local JWT secrets with Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it twice and use different values for access and refresh secrets.

## Local Frontend

Copy the frontend example file:

```bash
copy frontend\.env.example frontend\.env.local
```

Required frontend variable:

- `NEXT_PUBLIC_API_URL`: browser-visible backend API URL, usually `http://localhost:4000/api`.
- `NEXT_PUBLIC_REALTIME_URL`: browser-visible Socket.IO backend URL, usually `http://localhost:4000`.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: required before browser push subscription can be enabled.

Because `NEXT_PUBLIC_API_URL` is exposed to the browser bundle, do not put secrets in it.

## Docker Compose

Generate an ignored Docker environment with separate random JWT secrets:

```powershell
node scripts/create-local-env.mjs
```

Docker Compose reads root `.env` automatically. Use `--force` only for an
intentional local token-secret rotation.

The Docker PostgreSQL service is exposed on host port `5433` by default so it
does not collide with a native PostgreSQL installation on `5432`. Containers
still connect to `postgres:5432`.

Docker also runs Mailpit for local auth-email delivery. Its inbox/API and SMTP
ports bind to `127.0.0.1:8025` and `127.0.0.1:1025` by default; override them
with `MAILPIT_UI_PORT` and `MAILPIT_SMTP_PORT`. Mailpit is a development sink,
not a public email provider.

The same Compose stack runs Prometheus, Alertmanager, and Grafana on
`127.0.0.1:9090`, `127.0.0.1:9093`, and `127.0.0.1:3001`. The environment
generator creates the ignored metrics token file and Grafana password needed
for first startup. See `docs/monitoring.md` before changing monitoring ports,
credentials, retention, or alert routing.

## Production

Set production values through the hosting platform or secret manager.

Minimum production variables:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX_REQUESTS`
- `LOG_LEVEL`
- `REPORT_STORAGE_DIR`
- `WEEKLY_REPORT_DELIVERY_ENABLED`
- `WEEKLY_REPORT_DELIVERY_PROVIDER`
- `WEEKLY_REPORT_EMAIL_PROVIDER`
- `WEEKLY_REPORT_RECIPIENT_EMAILS`
- `WEEKLY_REPORT_EMAIL_FROM`
- `WEEKLY_REPORT_SMTP_HOST`
- `WEEKLY_REPORT_SMTP_PORT`
- `WEEKLY_REPORT_SMTP_SECURE`
- `WEEKLY_REPORT_SMTP_USERNAME`
- `WEEKLY_REPORT_SMTP_PASSWORD`
- `WEEKLY_REPORT_API_ENDPOINT`
- `WEEKLY_REPORT_API_KEY`
- `WEEKLY_REPORT_DELIVERY_TIMEOUT_MS`
- `WEEKLY_REPORT_DELIVERY_MAX_ATTEMPTS`
- `AUTH_EMAIL_DELIVERY_ENABLED`
- `AUTH_EMAIL_PROVIDER`
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_SMTP_HOST`
- `AUTH_EMAIL_SMTP_PORT`
- `AUTH_EMAIL_SMTP_SECURE`
- `AUTH_EMAIL_SMTP_USERNAME`
- `AUTH_EMAIL_SMTP_PASSWORD`
- `AUTH_EMAIL_API_ENDPOINT`
- `AUTH_EMAIL_API_KEY`
- `AUTH_EMAIL_OUTBOX_DIR`
- `AUTH_EMAIL_TIMEOUT_MS`
- `AUTH_EMAIL_PRINT_CODES_TO_CONSOLE`
- `AUTH_DEV_DISCLOSE_CODES`
- `AI_INSIGHT_PROVIDER`
- `AI_INSIGHT_ENDPOINT`
- `AI_INSIGHT_API_KEY`
- `AI_INSIGHT_EXTERNAL_PROVIDER_NAME`
- `AI_INSIGHT_EXTERNAL_AUTH_HEADER`
- `AI_INSIGHT_EXTERNAL_AUTH_SCHEME`
- `AI_INSIGHT_TIMEOUT_MS`
- `AI_INSIGHT_PROMPT_VERSION`
- `AI_INSIGHT_PROMPT_AUDIENCE`
- `AI_INSIGHT_MAX_INSIGHTS`
- `AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT`
- `AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL`
- `HOSTED_SCHEDULER_ENABLED`
- `HOSTED_SCHEDULER_PROVIDER`
- `HOSTED_SCHEDULER_TIMEZONE`
- `BACKGROUND_JOBS_MODE`
- `JOB_SCHEDULE_LEADERBOARD_REFRESH_ENABLED`
- `JOB_SCHEDULE_LEADERBOARD_REFRESH_CRON_UTC`
- `JOB_SCHEDULE_BURNOUT_PREDICTION_ENABLED`
- `JOB_SCHEDULE_BURNOUT_PREDICTION_CRON_UTC`
- `JOB_SCHEDULE_SCHEDULED_INSIGHTS_ENABLED`
- `JOB_SCHEDULE_SCHEDULED_INSIGHTS_CRON_UTC`
- `JOB_SCHEDULE_QUEST_REMINDERS_ENABLED`
- `JOB_SCHEDULE_QUEST_REMINDERS_CRON_UTC`
- `JOB_SCHEDULE_DAILY_DIGEST_ENABLED`
- `JOB_SCHEDULE_DAILY_DIGEST_CRON_UTC`
- `JOB_SCHEDULE_WEEKLY_TEAM_QUESTS_ENABLED`
- `JOB_SCHEDULE_WEEKLY_TEAM_QUESTS_CRON_UTC`
- `JOB_SCHEDULE_WEEKLY_REPORT_ENABLED`
- `JOB_SCHEDULE_WEEKLY_REPORT_CRON_UTC`
- `PUSH_DELIVERY_PROVIDER`
- `PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT`
- `REDIS_ENABLED`
- `REDIS_URL`
- `REDIS_NAMESPACE`
- `REDIS_PURPOSES`
- `SERVICE_NAME`
- `RELEASE_VERSION`
- `ERROR_TRACKING_ENABLED`
- `ERROR_TRACKING_PROVIDER`
- `ERROR_TRACKING_DSN`
- `METRICS_ENABLED`
- `METRICS_PROVIDER`
- `METRICS_PATH`
- `METRICS_AUTH_TOKEN` or `METRICS_AUTH_TOKEN_FILE` when metrics are enabled
- `PROMETHEUS_URL` when metrics are enabled
- `PROMETHEUS_PUBLIC_URL`
- `GRAFANA_PUBLIC_URL`
- `ALERTMANAGER_PUBLIC_URL`
- `OBSERVABILITY_QUERY_TIMEOUT_MS`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_REALTIME_URL`

Production secrets should be random, stored outside source control, and rotated if exposed.

For production PostgreSQL details, see `docs/postgresql-deployment.md`.
For Redis runtime planning, see `docs/redis-runtime.md`.
For hosted deployment order and service-level variable lists, see `docs/hosted-deployment.md`.
For monitoring and error-tracking planning, see `docs/monitoring.md`.
For weekly report delivery planning, see `docs/weekly-report-delivery.md`.
For browser push delivery planning, see `docs/push-delivery.md`.
For AI insight provider and prompt run history planning, see `docs/ai-insight-provider.md`.
