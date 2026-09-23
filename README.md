# LevelUpX

LevelUpX is a gameful productivity application that turns real work into quests,
focus sessions, progression, and useful feedback. The backend is a modular
monolith that can be split into services later.

## What Is Included

- Guided onboarding for students, professionals, and personal productivity.
- A Today dashboard with quick capture, prioritized work, automatically maintained UTC completion streaks, and recent signals.
- Quest lifecycle, priorities, tags, deadlines, recurring quests, projects, and idempotent offline creation.
- Focus sessions with goals, pause/resume, linked quests, notes, alerts, and history.
- XP, levels, coins, prerequisite-based skill progression, character classes, achievements, cosmetics, custom rewards, and reward history.
- Analytics, heatmaps, rule-based productivity insights, study plans, insight actions, and CSV/PDF administrative exports.
- Guilds, private invite codes, recurring weekly team quests, leaderboards, accountability partners, live accepted-partner focus presence, and blocker ownership.
- Notification preferences, quiet hours, quest reminders, daily briefings, push foundations, and weekly reports.
- Offline quest capture with IndexedDB, reconnect synchronization, and a service worker.
- Password recovery, optional user OTP, session management, data export, and account deletion.
- A separate administrator login entry plus moderation, automatic rapid/repetitive-completion signals, economy controls, product funnel metrics, historical API monitoring, active alerts, and security operations.
- Layered admin access using a trusted device key, three expiring codes, WebAuthn passkey step-up, short-lived access tokens, and rotating opaque refresh sessions.

## Architecture

| Layer | Technology |
| --- | --- |
| Web app | Next.js 16, React 19, TypeScript, Tailwind CSS, Chart.js, Recharts, Framer Motion |
| API | Express, TypeScript, Zod |
| Data | PostgreSQL 16, Prisma |
| Runtime support | Redis, Socket.IO, local or hosted job scheduler |
| Security | bcrypt, JWT access tokens, opaque refresh sessions, WebAuthn |
| Operations | Docker Compose, Prometheus, Alertmanager, Grafana, Sentry hooks, structured logs |

The main applications live in `frontend/` and `backend/`.

## Run With Docker

Requirements: Docker Desktop with Compose v2.

1. Create the ignored local environment and monitoring secrets:

   ```powershell
   node scripts/create-local-env.mjs
   ```

2. Build and start the complete stack:

   ```powershell
   docker compose up --build -d
   ```

3. Open the application:

   - Web: http://localhost:3000
   - API health: http://localhost:4000/api/health
   - Local auth inbox: http://localhost:8025
   - Grafana dashboard: http://localhost:3001
   - Prometheus: http://localhost:9090
   - Alertmanager: http://localhost:9093

The backend applies Prisma migrations and idempotent catalogue seeds before it
starts. The scheduler runs reminders, digests, insights, leaderboard refreshes,
weekly team-quest materialization, rule-based workload/fatigue checks, and weekly
reports in a separate container.

Prometheus securely scrapes the bearer-protected metrics endpoint, evaluates
recording and alert rules, and keeps seven days of local history. Grafana is
provisioned with the LevelUpX operational dashboard. Alertmanager routes local
alerts to Mailpit at `operator@levelupx.local`. The three monitoring ports bind
only to `127.0.0.1`; Grafana credentials come from the ignored `.env` file.

Docker routes password-reset and login verification messages to Mailpit. This
local inbox never relays mail to real recipients and is bound to `127.0.0.1`.
Replace it with a verified SMTP or email API provider before public deployment.

PostgreSQL is exposed to the host on `localhost:5433` so a native PostgreSQL
installation can keep the conventional `5432` port. Containers use
`postgres:5432` internally.

Useful commands:

```powershell
docker compose ps
docker compose logs -f backend scheduler prometheus alertmanager grafana
docker compose down
```

Do not commit `.env` or `ops/monitoring/secrets/metrics-token.local`. Running
the generator with `--force` rotates local JWT and scrape secrets, invalidates
existing access tokens, and requires the backend and Prometheus to restart
together.

## Local Development

Start PostgreSQL and Redis with Docker, then run each application in its own
terminal:

```powershell
docker compose up -d postgres redis mailpit

cd backend
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

## Verification

```powershell
cd backend
npm run typecheck
npm test
npm run test:integration
npm run test:db
npm run build
npm audit
```

```powershell
cd frontend
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm audit
```

The browser suite starts isolated services on `localhost:3100` and
`localhost:4100`, migrates the dedicated `levelupx_e2e` PostgreSQL schema, and
resets only its guarded fixture identities. It reads email-verification, OTP,
recovery, and admin codes from Mailpit instead of test-only API fields, so start the Docker
`postgres` and `mailpit` services first. Install its browser once with
`npx playwright install chromium`; CI installs Chromium, Mailpit, and its Linux
system dependencies automatically.

Validate deployment configuration before a hosted release:

```powershell
node scripts/validate-deployment-env.mjs --mode all
```

When metrics are enabled, this check also requires a protected scrape
credential, a valid Prometheus provider and route, and the backend-visible
`PROMETHEUS_URL` used by super-admin history.

## Admin Provisioning

`ROOT_SUPER_ADMIN_EMAIL` is set to
`kishanpansuriya4466@gmail.com` in the Docker template. This setting protects
that exact identity from status or role changes in the admin panel. Registering
the address does not grant a session or a role by itself. The owner must prove
both the account password and an emailed eight-digit verification code.
LevelUpX then activates the fixed root identity, enables its privileged
security policy, and writes an audit record in one database transaction. The
activation response remains signed out, and the application intentionally has
no role-granting CLI command.

After activation, register a trusted device before attempting privileged login.
From a running Docker stack:

```powershell
docker compose exec backend npm run auth:admin-device -- --email [] --label owner-laptop
```

For a local backend process:

```powershell
cd backend
npm run auth:admin-device -- --email [] --label owner-laptop
```

The command prints the device key once and stores only its bcrypt hash. Keep the
key in a password manager. It is an application credential, not a MAC address:
browsers do not expose a trustworthy MAC address, and MAC values are not a
secure remote identity.

Privileged access tokens are bound to the trusted-device record used during
login. After passkey verification, `/admin/security` lists active device
metadata and can revoke another device while preserving the current and last
active devices. Revocation invalidates unfinished three-code challenges,
writes an audit record, and sends a security notification. Re-registering the
same label rotates its key and invalidates access issued through the old
binding.

The privileged login sequence is:

1. Email and password.
2. Trusted device key.
3. Three codes from the configured auth channel.
4. WebAuthn passkey enrollment or verification at `/admin/security`.

Two-step security is mandatory while an account has `ADMIN` or `SUPER_ADMIN`
status. The API and profile UI cannot disable it, and PostgreSQL enforces the
same rule so a direct role or setting update cannot create an invalid
privileged account.

The Docker stack delivers local security messages to Mailpit at
http://localhost:8025. Codes and reset tokens are not returned by the API or
printed to backend logs. A public deployment must replace Mailpit with a real
SMTP or email API provider while keeping `AUTH_EMAIL_PRINT_CODES_TO_CONSOLE`
and `AUTH_DEV_DISCLOSE_CODES` set to `false`. Full security behavior and
recovery rules are enforced by the API and database.
