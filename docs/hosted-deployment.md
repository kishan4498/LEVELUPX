# Hosted Deployment Checklist

This checklist is for a hosted deployment with separate backend and frontend services, managed PostgreSQL, optional Redis, hosted scheduler entries, and monitoring integrations. It stays provider-neutral, but the repository now includes a GitHub Actions deployment workflow and a production infrastructure manifest.

See also `docs/deployment/production-infrastructure.md`.

## Backend Service

Build from `backend/`.

Required commands:

```bash
npm ci
npm run build
npm run prisma:deploy
npm run start
```

Set these environment variables in the hosting platform:

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
- `WEEKLY_REPORT_RECIPIENT_EMAILS`
- `AI_INSIGHT_PROVIDER`
- `AI_INSIGHT_ENDPOINT`
- `AI_INSIGHT_API_KEY`
- `AI_INSIGHT_TIMEOUT_MS`
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
- `METRICS_AUTH_TOKEN`
- `PROMETHEUS_URL`
- `PROMETHEUS_PUBLIC_URL`
- `GRAFANA_PUBLIC_URL`
- `ALERTMANAGER_PUBLIC_URL`
- `OBSERVABILITY_QUERY_TIMEOUT_MS`

When metrics are enabled, inject a random `METRICS_AUTH_TOKEN` of at least 32
characters from the platform secret manager. A container platform may mount
the same value as a file and set `METRICS_AUTH_TOKEN_FILE` instead. Prometheus
must send that value as a bearer credential, while `PROMETHEUS_URL` should use
the private service address reachable by the backend.

Deploy order:

- Provision PostgreSQL and set `DATABASE_URL`.
- Build the backend.
- Run `npm run prisma:deploy` once per release before serving traffic.
- Run `npm run prisma:seed` only for a fresh database or missing starter records.
- Start the backend with `npm run start`.
- Check `GET /api/health` and confirm `status: "ok"` plus `readiness.database: "configured"`.

## Frontend Service

Build from `frontend/`.

Required commands:

```bash
npm ci
npm run build
npm run start
```

Set these build/runtime variables:

- `NODE_ENV=production`
- `PORT`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_REALTIME_URL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

`NEXT_PUBLIC_API_URL` should point at the hosted backend API, for example `https://api.example.com/api`. `NEXT_PUBLIC_REALTIME_URL` should point at the same backend origin without `/api`.

## Docker Notes

The existing Dockerfiles are production-style builds:

- Backend image runs `npm run start` from compiled `dist/`.
- Frontend image runs `next start` from the built `.next` directory.
- Compose is local-development friendly and still uses placeholder secrets unless the root `.env` is replaced.

For hosted container platforms, run database migrations as a release command or one-off job before starting new backend instances.

## Background Jobs

Jobs are currently run through:

```bash
npm run jobs:run
```

Use the hosted scheduler plan to create provider-specific cron entries:

```bash
npm run jobs:schedule
```

Each generated entry uses an explicit command such as `npm run jobs:run -- weekly-report`. If Redis is disabled, avoid running the same scheduled job concurrently on multiple instances. If `REDIS_ENABLED=true` and `REDIS_PURPOSES` includes `distributed-lock`, duplicate scheduler workers will skip jobs already locked by another worker.

Recommended first-pass schedules and recovery steps live in `docs/background-jobs.md`.

## Release Sanity Checks

Before cutting over traffic:

- Backend typecheck and tests pass.
- Frontend typecheck and build pass.
- `DATABASE_URL` points to the intended database.
- JWT secrets are real random values and are different from each other.
- Browser can reach `NEXT_PUBLIC_API_URL`.
- Socket.IO can connect through `NEXT_PUBLIC_REALTIME_URL`.
- `GET /api/health` returns `status: "ok"` and `readiness.database: "configured"`.
- Unauthenticated `GET /metrics` returns `401`, the authenticated Prometheus
  target is up, and the super-admin console receives historical telemetry.
- A controlled warning reaches the production Alertmanager receiver.

The deployment workflow lives at `.github/workflows/deploy.yml`.
Validate production environment variables locally or in CI with:

```bash
node scripts/validate-deployment-env.mjs --mode all
```

Monitoring and error-tracking configuration intent is documented in `docs/monitoring.md`.
Browser push delivery planning is documented in `docs/push-delivery.md`.
