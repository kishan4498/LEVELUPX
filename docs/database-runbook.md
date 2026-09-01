# LevelUpX Database Runbook

This runbook covers the current PostgreSQL and Prisma workflow for LevelUpX.

## Required Environment Variables

The backend needs these variables before running migrations, seeds, or the API:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_ACCESS_SECRET`: at least 32 characters.
- `JWT_REFRESH_SECRET`: at least 32 characters.
- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: optional, defaults to `4000`.

Example local Docker database URL:

```bash
postgresql://postgres:postgres@localhost:5432/levelupx?schema=public
```

Example in Docker Compose from the backend container:

```bash
postgresql://postgres:postgres@postgres:5432/levelupx?schema=public
```

## Local Non-Docker Workflow

From `backend/`:

```bash
npm.cmd install
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
npm.cmd run dev
```

Use `npm.cmd run prisma:migrate` only for local development. It creates and applies development migrations.

## Local Docker Workflow

From the repository root:

```bash
docker compose up --build
```

After the containers are healthy, run migrations and seed data:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

Use `migrate deploy` in container and production-like environments because it applies existing migrations without creating new ones.

The backend also exposes this as:

```bash
npm.cmd run prisma:deploy
```

## Production Migration Workflow

Before applying migrations:

- Confirm the migration SQL has been reviewed.
- Take a database backup or snapshot.
- Confirm the deployed backend version matches the migration set.
- Confirm `DATABASE_URL` points to the intended production database.

Production command from the backend release environment:

```bash
npm.cmd run prisma:deploy
```

Then seed only when starter records are missing or after a fresh database setup:

```bash
npm run prisma:seed
```

The seed script is idempotent for current starter records:

- Character classes use `createMany(..., skipDuplicates: true)`.
- Achievements use `createMany(..., skipDuplicates: true)`.
- Economy settings are created only if no settings row exists.

## Rollback And Backup Cautions

Prisma migrations should be treated as forward-only by default.

If a production migration fails:

- Stop the rollout.
- Inspect the failed migration in the `_prisma_migrations` table.
- Restore from the latest backup if data integrity is at risk.
- Prefer a follow-up corrective migration over manual schema edits.

Do not delete migration folders after they have been applied anywhere shared.

For managed PostgreSQL setup, SSL connection strings, and the first production deployment checklist, see `docs/postgresql-deployment.md`.

## Current Baseline Migration

The first migration is:

```text
backend/prisma/migrations/20260519120000_initial_levelupx_schema/migration.sql
```

It includes the full current schema, including:

- `Achievement.title` unique index.
- `EconomySettings` table.
