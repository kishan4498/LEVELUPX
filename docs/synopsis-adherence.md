# Synopsis Adherence

LevelUpX implements the defensible product and architecture described in
`synop.md`, with evidence boundaries made explicit.

## Synopsis Coverage

- Next.js progressive web application with responsive and offline foundations.
- Express and TypeScript modular backend, PostgreSQL, Prisma, Redis, and Docker.
- User and admin applications with authentication, authorization, moderation,
  economy controls, analytics, reports, and abuse review.
- RPG productivity through quests, difficulty, XP, coins, levels, transactionally
  maintained UTC completion streaks, prerequisite-based skill trees, classes,
  achievements, cosmetics, inventory, rewards, and recovery quests.
- Focus and Pomodoro-style sessions linked to real work.
- Guilds, recurring weekly team-quest series, private invites, leaderboards,
  membership-authorized realtime rooms, and live focus presence shared only
  with accepted accountability partners.
- Personal analytics, heatmaps, CSV export, administrative CSV/PDF exports, weekly reports, study planning,
  non-diagnostic workload/recovery signals, and explainable productivity
  insights.
- Notifications, push foundations, preferences, reminders, daily digests, and
  quiet hours.
- Super-admin system health, API telemetry, audit history, request monitoring,
  configuration readiness, optional Prometheus status, and background-job visibility.
- A distinct administrator login entry that reuses the trusted-device and
  three-code challenge before the existing WebAuthn step-up.
- Chart.js analytics and reduced-motion-aware Framer Motion transitions, while
  the broader chart set continues to use Recharts.
- Deployment validation, structured logs, Prometheus/Sentry integration points,
  Redis locking/cache/rate limits, local scheduling, and a hosted-scheduler deployment plan/configuration.

## Practical Additions

- Guided onboarding and productivity modes.
- Projects, tags, priorities, recurrence, quick capture, and client-assisted offline replay.
- Pause/resume focus, session goals, notes, alerts, and deep links.
- Accountability partners, blocker ownership, custom rewards, and insight-to-
  action workflows.
- Forgot-password, optional user OTP, session revocation, data export, and
  account deletion.
- Rotating opaque refresh sessions with atomic single-row replacement; stale-token reuse is rejected, while family-wide replay revocation is not implemented.
- Permanent root-owner guardrails and recorded privileged mutations.
- Trusted admin device keys, three-code challenges, and WebAuthn passkey step-up.
- Product funnel events for activation and feature adoption.

## Boundaries

The application includes provider contracts and local implementations, but a
public production deployment still needs real email, HTTPS, managed databases
and secrets, external monitoring destinations, web-push credentials, backup
drills, and policy review. The current productivity intelligence is an
explainable rule system, not a trained predictor or medical diagnostic tool.
Its displayed scores are rule-assigned values rather than calibrated
probabilities. Every BURNOUT_WARNING is normalized to fixed non-diagnostic
copy. Optional insight titles/messages are structurally validated and length-limited.
Recommendation output is type-checked, trimmed, and capped at three items, but
each recommendation's length and arbitrary provider text are not fully constrained.
Hosted use therefore requires provider governance and output review. Machine-learning personalization is deferred until there is
enough consented data to train and validate it responsibly.

Those boundaries are tracked in `PROJECT_TODO.md`; they are not represented as
already-complete production infrastructure.

## Synopsis-to-Report Traceability

| Synopsis commitment | Current implementation | Project report coverage |
|---|---|---|
| Responsive PWA, quests, Pomodoro-style focus, and offline foundations | Next.js application, explicit work/break presets, focus lifecycle, manifest/service worker, and IndexedDB quick-capture replay | Abstract; Sections 1.1, 3.1, 4.10, 5.5, 6.2, 6.5, and 7.2 |
| XP, coins, classes, streaks, prerequisite skills, achievements, cosmetics, and personal rewards | Same-user locked completion transaction, one draft-time difficulty adjustment, UTC streak maintenance, ledgers, prerequisite graph, and reward modules | Sections 3.1, 4.5-4.9, 5.2-5.7, 6.2-6.6, and 7.2-7.5 |
| Guilds, leaderboards, weekly team quests, and realtime accountability | Membership-gated Socket.IO rooms, idempotent weekly recurrence, accepted-peer presence, and block/remove cache clearing | Sections 3.1, 4.3-4.9, 5.2, 5.3.6, 5.10, 6.2-6.6, and 7.2-7.7 |
| Analytics, reports, and productivity intelligence | Descriptive analytics, Chart.js/Recharts views, personal CSV plus administrative CSV/PDF exports, fixed workload-warning copy, and controlled local rules; arbitrary optional-provider text still requires governance | Sections 2.2, 3.1, 5.5, 5.9, 6.2, 6.5, and 7.2-7.6 |
| Separate user/admin journeys and abuse review | Dedicated admin login, trusted-device proof, three codes, WebAuthn step-up, moderation, audits, exports, and concurrency-safe automatic signal deduplication | Sections 3.1, 3.5, 4.4-4.6, 4.12, 5.2, 5.8, 6.2-6.7, and 7.2-7.7 |
| Modern TypeScript/PostgreSQL architecture | Next.js/React frontend, Express modular monolith, Prisma/PostgreSQL, optional Redis, scheduler, and local Compose/observability configuration | Sections 3.3-3.4, 4.1-4.2, 4.8-4.14, and 5.4-5.10 |
| Evidence-backed completion rather than promotional claims | Current unit/HTTP/static/build evidence is separated from skipped database and not-rerun browser lanes; production and participant evidence remains deferred | Abstract; Sections 6.1-6.10, 7.3-7.8, and 8.1-8.3 |

## Final Verification Baseline

- Backend default suite: 53 files, 270 tests passed.
- Backend HTTP integration: 1 file, 5 tests passed.
- Frontend suite: 6 files, 10 tests passed.
- Backend database lane: 4 files, 16 tests discovered and skipped because no
  safe isolated test database was configured.
- Backend/frontend type checks, zero-warning lint commands, and production
  builds passed; Prisma validation and Docker Compose configuration passed.
- Next.js production build: 25 static pages from 23 `page.tsx` source files.
- Playwright: not rerun after the adherence changes and not claimed as current
  passing evidence.
