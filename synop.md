# Project Synopsis

## Title

Development of LevelUpX: A Web-Based Gamified Productivity and Focus Management Platform

## Introduction

LevelUpX is a web-based gamified productivity platform for students, professionals, and personal-productivity users. It connects planned tasks, timed focus sessions, visible progression, reflection, and optional social accountability. A task is represented as a quest. When an eligible quest is completed, the backend records controlled experience points (XP), virtual coins, level progress, streak state, and ledger evidence.

The project has separate user and administrator journeys. Users can manage projects and quests, run work or break sessions, review analytics, progress through prerequisite-linked skills, earn achievements, join guilds, participate in weekly team quests, and use personal rewards. Administrators use a dedicated privileged entry flow to review users, safety reports, economy settings, analytics, marketplace records, audits, and system health. Administrative analytics and marketplace records can be exported as CSV or PDF.

The default productivity intelligence is an explainable rule-based guidance system, with optional external-provider contracts for insights and analytics recommendations. It identifies stored workload or consistency patterns and suggests recovery, scheduling, or study actions. Every `BURNOUT_WARNING` is normalized to fixed non-diagnostic workload/recovery copy, and displayed insight scores are not calibrated probabilities. Optional insight titles/messages are length-limited; recommendation output is type-checked, trimmed, and capped at three items, but each recommendation's length and arbitrary provider text are not fully constrained. Hosted use therefore requires provider governance and output review.

## Aim

To design and implement a Progressive Web Application that combines quest planning, focus-session tracking, gamified progression, analytics, bounded productivity guidance, and controlled social accountability in one system.

## Objectives

1. Develop a responsive PWA in which users can manage productivity through quests, a 25-minute Pomodoro-style preset, other focus presets, and explicit work or break sessions.
2. Implement a role-playing progression system with XP, coins, levels, character classes, automatic UTC completion streaks, prerequisite-linked skills, achievements, cosmetics, and personal rewards.
3. Provide social accountability through guilds, membership-authorized realtime rooms, global and guild leaderboards, accepted-peer focus presence, and idempotent recurring weekly team quests.
4. Produce descriptive productivity analytics, heatmaps, reports, and bounded rule-based workload, recovery, consistency, and scheduling guidance.
5. Provide verified identity, role-based authorization, a staged privileged login, moderation, automated rapid/repetitive-completion review signals, economy controls, and audit records.
6. Verify the implementation through unit, HTTP integration, static, build, database, and browser test lanes while reporting unavailable lanes separately.

## Scope

The implemented scope includes:

- verified registration, login, refresh sessions, recovery, account export, and permanent account deletion;
- projects, detailed quests, recurrence, subtasks, reminders, guarded completion, and offline quick capture;
- focus work/break presets, pause/resume, notes, history, and statistics;
- XP and coin ledgers, levels, classes, UTC streaks, prerequisite skills, achievements, cosmetics, a marketplace, and custom rewards;
- personal analytics, heatmaps, and CSV export; administrator analytics and marketplace CSV/PDF exports; bounded insights, notifications, reminders, and digests;
- guild membership, weekly team quests, leaderboards, accountability relationships, and accepted-peer focus presence;
- a dedicated administrator login, trusted-device proof, three one-time codes, WebAuthn step-up, moderation, economy controls, exports, audits, health, metrics, and automatic abuse-review signals;
- a service-worker offline fallback and an IndexedDB queue limited to quick quest capture; and
- local Docker Compose, PostgreSQL, optional Redis facilities, scheduler, Mailpit, Prometheus, Alertmanager, and Grafana configuration.

The current scope does not include a verified public production deployment, real hosted email or push delivery, managed backups, formal load testing, a completed cross-browser rerun, a participant usability study, or a validated machine-learning model. Offline support is deliberately limited and does not make all mutations available without the API.

## Existing System and Literature Position

Physical planners, basic checklists, calendars, and isolated timer applications can record tasks or elapsed time, but they commonly keep planning, focused work, progression feedback, reflection, and collaboration in separate records. LevelUpX studies whether those records can be connected without claiming that gamification automatically improves motivation.

The project is informed by literature on gamification, goal setting, self-determination, timed breaks, personal informatics, workload, service workers, and realtime delivery. The report distinguishes short-term software feedback from proven psychological outcomes. In particular, rewards, rankings, and fixed-duration sessions are treated as interface mechanisms whose effects require participant evaluation rather than assumed benefits.

## Proposed and Implemented System

After registration and onboarding, a user selects a productivity mode and character class, creates quests, and can associate focused work with those quests. Quest completion uses a guarded transaction that applies one draft-time difficulty adjustment, completion-time streak and economy multipliers, inflation-aware coin issuance, per-quest caps, and the remaining daily coin allowance. The same transaction maintains the UTC streak, profile totals, and ledgers.

The application uses a modular-monolith architecture. The browser communicates with a Next.js frontend and an Express REST/realtime backend. PostgreSQL and Prisma hold authoritative relational data; optional Redis support is used for supported cache, rate-limit, and locking facilities. Socket.IO rooms are authorized by current membership, and focus presence is sent only to the user and accepted accountability peers. Recurring weekly team quests use a series/week uniqueness rule so job retries do not create duplicates or backfill missed historical weeks.

The administrator journey begins at `/admin/login`, reuses the credential and trusted-device challenge, consumes three separate codes, and then completes a WebAuthn step-up before protected administration operations. The system records reviewable moderation and audit evidence. Automatic rapid or repetitive quest-completion rules create concurrency-safe deduplicated OPEN review signals; they do not automatically punish the user.

## Software Requirements

- Operating system: Windows, Linux, or macOS
- Frontend: Next.js, React, TypeScript, Tailwind CSS, Zustand, Recharts, Chart.js, and Framer Motion
- Backend: Node.js, Express, TypeScript, Zod, and Socket.IO
- Database and ORM: PostgreSQL and Prisma ORM
- Authentication and security: JSON Web Tokens, password hashing, rotating refresh sessions, trusted-device proof, one-time codes, and WebAuthn for privileged step-up
- Optional/local operations: Redis, Docker Compose, Mailpit, Prometheus, Alertmanager, and Grafana

## Hardware Requirements

- Processor: Intel Core i3, AMD Ryzen 3, or equivalent and above
- Memory: 4 GB minimum; 8 GB recommended for development
- Storage: approximately 15 GB of free space for source, dependencies, builds, containers, and local data
- Client: a supported desktop or mobile browser; a compatible authenticator is required for physical privileged passkey use

These figures are practical development targets rather than benchmark-derived minimums.

## Current Verification Result

On 12 August 2026, the final source passed 270 backend tests in 53 files, 5 HTTP integration tests in 1 file, and 10 frontend tests in 6 files. Backend and frontend type checks, zero-warning lint commands, production builds, Prisma validation, and Docker Compose configuration also passed. The Next.js production build generated 25 static pages. Sixteen database tests in 4 files were discovered but skipped because no isolated test database was configured. The Playwright browser lane was not rerun after the adherence changes and is not reported as a current pass.

## Conclusion and Future Work

LevelUpX is a substantial working local implementation of the proposed gamified productivity workflow. Its main contribution is the connection between quest planning, focus records, transaction-backed progression, reflection, and scoped accountability. The current evidence supports implementation and local verification claims, but it does not prove improved motivation, learning quality, productivity, medical risk, usability, scalability, or production readiness.

Future work should first rerun the database and Playwright lanes in isolated environments, restrict production realtime origins, add live readiness probes, configure managed secrets and backups, verify hosted delivery, and conduct accessibility, cross-browser, recovery, security, load, and participant studies. Provider-assisted personalization or machine learning should be considered only after consented data, governance, validation, explanation, fallback, and deletion controls are defined.

## References

- React documentation: https://react.dev/
- Next.js documentation: https://nextjs.org/docs/app
- Node.js documentation: https://nodejs.org/docs/latest/api/
- PostgreSQL 16 documentation: https://www.postgresql.org/docs/16/
- Socket.IO documentation: https://socket.io/docs/v4/
- Prisma ORM documentation: https://www.prisma.io/docs/orm
