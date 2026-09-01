# Test Database Strategy

LevelUpX keeps normal unit tests database-free. Database-backed tests should live in files ending with `.db.test.ts` and run through the dedicated command:

```bash
npm run test:db
```

## Local Setup

Use a separate PostgreSQL database for database tests, never a development or production database.

Example environment:

```bash
NODE_ENV=test
DATABASE_URL=postgresql://postgres:your-local-docker-password@localhost:5433/levelupx_test?schema=public
JWT_ACCESS_SECRET=test-access-secret-with-at-least-32-characters
JWT_REFRESH_SECRET=test-refresh-secret-with-at-least-32-characters
```

When the test runner is inside Docker, explicitly allow the Compose database hostname:

```bash
TEST_DATABASE_ALLOWED_HOSTS=postgres
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/levelupx_test?schema=public
```

The reset guard still requires `NODE_ENV=test` and a database name containing `test`.

Apply migrations before running database tests:

```bash
npx prisma migrate deploy
npm run test:db
```

## Reset Helper

Database-backed tests can import:

```ts
import { disconnectTestDatabase, resetTestDatabase } from "../test/testDatabase.js";
```

Call `resetTestDatabase()` in `beforeEach` or `beforeAll`, depending on the test shape. The helper refuses to reset unless `NODE_ENV=test` and the database URL looks like a local test database.

Tests that require the database should use `isTestDatabaseConfigured()` and skip themselves when the local test database is not configured. This lets the `test:db` lane be present everywhere while still requiring an explicit safe database before destructive reset logic runs.

## CI Shape

CI should run the existing fast checks first:

```bash
npm run test
npm run test:integration
npm run typecheck
npm run build
```

When a PostgreSQL service is available, CI can then run:

```bash
npx prisma migrate deploy
npm run test:db
```

Keep database tests focused on transaction behavior that cannot be trusted through unit stubs, such as quest completion payouts, reward history writes, and duplicate-write guards.
