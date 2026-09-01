# PostgreSQL Deployment Guide

LevelUpX already uses PostgreSQL through Prisma. This guide records the production shape so database setup does not depend on memory.

## Production Database

Create a managed PostgreSQL database with:

- PostgreSQL 16 or newer.
- A dedicated database, for example `levelupx`.
- A dedicated application user with ownership or migration privileges for that database.
- Automated backups or snapshots enabled before the first real user launch.
- SSL required for public network connections.

Use one production connection string in the backend environment:

```bash
DATABASE_URL=postgresql://levelupx_user:password@host:5432/levelupx?schema=public&sslmode=require
```

If the host gives an internal private-network URL for the app runtime, prefer that URL. Keep a separate admin connection outside the app for manual database maintenance.

## First Deployment

From the built backend release environment:

```bash
npm.cmd run prisma:deploy
npm.cmd run prisma:seed
npm.cmd run start
```

`prisma:deploy` applies existing migrations only. It should be used for production and staging because it does not create new migration files.

Run the seed command only for a fresh database or when starter records are missing. Current seed data is idempotent for character classes, achievements, and economy settings.

## Release Checklist

Before a deployment that includes migrations:

- Confirm `DATABASE_URL` points to the intended database.
- Review the SQL under `backend/prisma/migrations`.
- Take a backup or provider snapshot.
- Deploy the backend build that matches the migration set.
- Run `npm.cmd run prisma:deploy`.
- Start the backend and check `/health`.

## Rollback Notes

Treat Prisma migrations as forward-only. If a migration fails, stop the rollout, inspect `_prisma_migrations`, and restore from the latest backup if data integrity is uncertain. Prefer a corrective follow-up migration over manual schema edits.

Real hosted database provisioning, secret manager setup, and automated deployment pipeline wiring are still future fragments.

For the full backend/frontend startup order, see `docs/hosted-deployment.md`.
