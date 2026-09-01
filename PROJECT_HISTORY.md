# LevelUpX Project History

Completed backend fragments so far:

1. Backend foundation: Express app, strict TypeScript, Prisma schema, errors, validation, health route.
2. Authentication & Authorization: register, login, `me`, bcrypt, JWT, auth and role middleware.
3. Quest Module basics: quest CRUD, ownership checks, archive-on-delete, base rewards.
4. Quest Progress + Rewards: start, complete, fail, XP/coin transactions, profile updates.
5. Focus Sessions: start, stop, history, stats, optional quest linking.
6. Achievements: built-in achievements, listing, user achievements, unlock checks.
7. Rewards Summary APIs: reward summary, XP history, coin history.
8. User Profile APIs: current user/profile, avatar/name update, character class selection.
9. User Analytics APIs: weekly summary, monthly heatmap, focus consistency.
10. AI Insights: rule-based insights stored in `ai_insights`.
11. Guild Basics: create/list/detail/join/leave, owner/member handling.
12. Guild Team Quests: create/list/progress, membership and role checks.
13. Leaderboards: global and guild ranking by XP and focus minutes.
14. Notifications: list/read notifications and quest/achievement hooks.
15. Abuse Detection: manual reports and suspicious quest completion rules.
16. Admin Basics: dashboard, users, user status, abuse report moderation.
17. Admin Economy Settings: `EconomySettings`, read/update settings, admin action records.
18. Economy Settings Applied To Rewards: XP/coin multipliers, reward cap, daily coin limit.
19. Admin Analytics: active users, XP generated, coin inflation, abuse counts, active guilds.
20. Frontend scaffold: Next.js app, Tailwind, auth API client, auth store, login/register pages, dashboard shell.
21. Dashboard + Quest UI: refreshed dashboard user data, quest list, create form, start/complete/fail actions.
22. Focus Session Frontend: `/focus`, stats cards, start/stop actions, recent history, optional quest linking.
23. Character Profile Frontend: `/profile`, editable name/avatar, profile stats, character class listing and selection.
24. Achievements Frontend: `/achievements`, unlocked/locked states, rarity treatment, unlocked reward totals.
25. Rewards Frontend: `/rewards`, reward summary cards, XP history, coin history, streak momentum panel.
26. Analytics Frontend: `/analytics`, weekly summary cards, 30-day activity grid, focus consistency summary.
27. AI Insights Frontend: `/insights`, stored insight list, generate action, type badges, confidence bars.
28. Notifications Frontend: `/notifications`, summary cards, read/unread states, mark-as-read action.
29. Leaderboard Frontend: `/leaderboard`, global rankings, period selector, summary cards, current user highlight.
30. Guild Frontend: `/guilds`, create/list/detail, join/leave actions, member role summary.
31. Team Quest Frontend: team quest list/create/progress inside `/guilds`, progress bars, reward badges.
32. Admin Frontend Basics: `/admin`, guarded admin dashboard cards, user list, user status updates.
33. Admin Abuse Moderation Frontend: abuse report list in `/admin`, severity/status badges, status update actions.
34. Admin Economy Settings Frontend: economy settings form in `/admin`, multiplier and reward limit updates.
35. Admin Analytics Frontend: analytics section in `/admin`, platform health cards, coin inflation, abuse summaries, active guilds.
36. User Abuse Report Frontend: `/abuse-reports`, submit report form, severity selection, own report history.
37. Frontend Polish: scrollable sidebar, nested active route matching, table overflow containment.
38. Database Migration: baseline Prisma migration for current schema, including `Achievement.title` unique index and `EconomySettings`.
39. Seed Data: Prisma seed script for character classes, achievements, and default economy settings.
40. Backend Test Foundation: Vitest runner, reward calculation tests, auth validation tests, reward history validation tests.
41. Backend Integration Tests: Supertest app integration tests and separate unit/integration Vitest configs.
42. CI Foundation: GitHub Actions workflow for backend validation/tests/build and frontend typecheck/build.
43. Docker Foundation: backend/frontend Dockerfiles, docker-compose with PostgreSQL, and container workflow docs.
44. Production Database Runbook: local, Docker, and production migration/seed guidance with backup cautions.
45. Environment Templates: tightened env examples, Docker env example, compose variables, environment guide.
46. Rate Limiting: configurable mutation/auth rate limiters, env controls, and focused middleware tests.
47. Request Logging: structured JSON request logger, log-level env control, logger tests, morgan removal.
48. Background Jobs Foundation: CLI job runner, registry, structured job results, placeholders for weekly reports, leaderboard refresh, and burnout prediction.
49. Achievement Reward Payout: achievement unlocks now pay XP/coin bonuses, write reward transactions, update profile totals, and skip duplicate payouts.
50. Guild Reward Payout: completed team quests now pay current guild members, write reward transactions, update profile totals, and expose payout details.
51. Leaderboard Snapshot Persistence: leaderboard refresh now writes global and guild snapshot rows, and the background job uses the shared refresh path.
52. Socket.IO Realtime Foundation: backend Socket.IO server, access-token connection auth, room helpers, typed events, and domain event publishing.
53. Admin Economy Analytics Expansion: admin analytics now exposes reward source breakdowns and coin flow by transaction type.
54. Admin Role Management: SUPER_ADMIN-only role updates, self-role-change guard, audit records, validation, and authorization tests.
55. Admin Economy Safeguards: admin analytics now includes XP pressure, coin inflation pressure, and reward cap pressure signals.
56. Analytics Report Export: admin analytics can now be exported as CSV with stable report headers and escaped values.
57. Weekly Report Job: weekly report job now generates platform activity summary metadata from quests, XP, coins, and focus sessions.
58. Burnout Prediction Job: burnout job now scans active users, classifies risk, and stores burnout warning insights.
59. Auth Middleware Tests: access token verifier and auth middleware now have focused unit coverage for valid, missing, invalid, and wrong-type tokens.
60. Reward Calculation Test Expansion: reward tests now cover daily coin exhaustion, partial limits, XP caps, and 14-day streak behavior.
61. Test Database Strategy: dedicated DB-test Vitest lane, guarded reset helper, and database testing runbook.
62. Quest Completion Transaction Tests: DB-backed quest completion test now covers reward writes, profile totals, and duplicate payout protection.
63. Admin Authorization Tests: route-level admin authorization coverage for unauthenticated, user, admin, and SUPER_ADMIN-only paths.
64. Abuse Rule Tests: abuse service now has focused coverage for manual reports, listing, suspicious completion rules, dedupe, and clean completions.
65. Leaderboard Snapshot Read Path: leaderboard APIs now use fresh snapshots with live-ranking fallback for stale or missing snapshots.
66. Contributor-Specific Team Quest Rewards: team quest progress now records contributors and completion payouts prefer contributors with all-member fallback.
67. Admin Analytics UI Expansion: admin UI now displays reward sources, coin flow, and economy safeguard levels.
68. Admin Role Management UI: SUPER_ADMIN users can update other users' roles from the admin user table while self role changes stay disabled.
69. Admin Analytics Export UI: admin analytics now has an authenticated CSV export control that downloads the existing backend report attachment.
70. PDF Analytics Export Backend: admin analytics export now supports PDF attachments while keeping the CSV export path stable.
71. PDF Analytics Export UI: admin analytics now exposes CSV and PDF export buttons with format-specific loading and notices.
72. Admin Report History Foundation: generated admin analytics exports now write report metadata and recent report history is available through an admin API.
73. Admin Report History UI: the admin page now loads recent generated reports and displays report type, format, size, generator, and date.
74. Weekly Report Delivery Foundation: the weekly report job now records metadata-only report history when an admin owner exists.
75. Report File Storage Foundation: weekly report files can be written to local development storage when `REPORT_STORAGE_DIR` is configured.
76. Stored Report Download API: admins can download stored report files by report id when a `storageKey` exists.
77. Stored Report Download UI: stored report rows in admin history now expose an authenticated download action.
78. External Weekly Report Delivery Prep: weekly reports now record delivery readiness metadata without sending external messages.
79. Admin Economy Safeguard Enforcement Recommendations: economy safeguards now include conservative admin-visible recommendations and suggested actions.
80. Admin Audit History API: recent admin actions are exposed through a read-only admin endpoint with actor, target, metadata, and date.
81. Admin Audit History UI: the admin page now displays recent audit actions with actor, action, target, metadata summary, and date.
82. Richer Abuse Evidence Metadata UI: abuse report metadata now renders as readable evidence rows in admin moderation and user report history.
83. Automated Abuse Prompt Signals: quest completion now surfaces returned abuse review signals on the quest board without auto-submitting extra reports.
84. Dashboard Data Expansion: the dashboard now shows weekly analytics, focus stats, reward streaks, unread notifications, and active quest summaries.
85. Pomodoro Countdown Polish: active focus sessions now show a live countdown, elapsed time, progress, and overtime state based on the existing session start time and mode duration.
86. Character Skills UI Foundation: built a read-only skills API and `/skills` page, seeded baseline skills, added skills navigation, and surfaced skill progress on the profile page.
87. Achievement Filtering and Progress: achievements now expose user progress metadata, and the frontend supports status/rarity filters with progress bars.
88. Reward Charts and Export Foundation: the rewards page now shows recent XP/coin movement charts, coin-flow mix, and browser-side CSV export for fetched reward history.
89. Analytics Charts and Recommendations Foundation: user analytics now has weekly trend bars, strongest activity day ranking, completion-rate visualization, and local recommendations from existing analytics data.
90. External AI Insight Provider Prep: AI insight generation now uses a provider boundary with default rule-based insights, optional external HTTP configuration, safe fallback behavior, and focused provider tests.
91. Insight Feedback Foundation: AI insights now store helpful/not-helpful feedback, expose an authenticated feedback API, and let users rate insight cards from the frontend.
92. Notification Preferences Foundation: notification preferences now have a migration-backed user model, authenticated read/update APIs, inbox preference toggles, and focused service tests.
93. Realtime Notification Counts Foundation: notifications now expose unread counts, publish user-scoped unread-count realtime events, and show a refreshed inbox badge in the app shell.
94. Guild Leaderboard UI Foundation: the guild detail page now shows member leaderboard rankings by period using the existing guild leaderboard API.
95. Realtime Guild and Team Quest Updates: guild membership and team quest events now publish realtime updates, and the guild page connects to scoped Socket.IO updates for selected guild refreshes.
96. Realtime Leaderboard Refresh Foundation: leaderboard snapshot refresh events now include scope metadata, and global/guild leaderboard views refresh when their selected scope changes.
97. Offline Shell Foundation: the frontend now has a web manifest, SVG app icon, service worker registration, conservative static caching, and a cached offline fallback page.
98. Push Notification Prep: notification preferences now include a push switch, the service worker handles future push events, and the inbox shows browser push readiness and permission status.
99. Category-Aware Notification Suppression: notifications now store categories, known reward and achievement notifications respect user preferences, and the inbox displays category badges.
100. Broader Frontend Socket Subscription Foundation: frontend realtime setup now uses a shared socket hook, AppShell subscribes to unread count updates, and leaderboard/guild pages reuse shared connection lifecycle handling.
101. Push Subscription Storage Foundation: authenticated browser push subscriptions can now be stored through the notifications API, with frontend registration gated by a configured VAPID public key.
102. Push Provider Delivery Prep: notification creation now has a push provider boundary, active subscription lookup, and stale subscription failure tracking without requiring a real external push provider.
103. Achievement Celebration UI: achievement unlocks now surface through a realtime celebration on the achievement hall and an immediate quest-completion reward panel.
104. Skill Level-Up Rules: the skills API now derives and persists conservative skill levels from existing activity stats, and the skills page explains rule progress and next targets.
105. Reward Economy Explanation UI: rewards now expose read-only economy context and the rewards page explains active multipliers, daily coin limits, and quest reward caps.
106. Inventory Cosmetics Foundation: built-in cosmetics now have inventory storage, level-based ownership, profile selection, and a profile-page inventory surface without shop purchases.
107. Insight Comments UI: insight feedback now supports user comments in the existing feedback flow, and insight cards show editable saved comments.
108. User Analytics Export: the analytics page now exports fetched weekly, focus, recommendation, and daily activity data as a browser-side CSV file.
109. Backend Reward Export Endpoint: reward ledger CSV exports now come from an authenticated backend endpoint, and the rewards page downloads that server-generated file.
110. Push Unsubscribe Lifecycle: browser push subscriptions can now be disabled through the notifications API, and the notification UI can unsubscribe this browser and update push preferences.
111. External Weekly Report Delivery Sender: weekly reports now use a delivery sender boundary with disabled default behavior and a local outbox sender for configured development delivery.
112. Burnout Feedback Loop Foundation: burnout prediction now skips duplicate recent warnings and suppresses new burnout warnings after recent not-helpful burnout feedback.
113. PostgreSQL Deployment Configuration: production PostgreSQL setup now has a backend env example, deployment guide, and `prisma:deploy` script tied into the database runbook.
114. Redis Runtime Configuration Foundation: Redis runtime intent now has a typed config resolver, env examples, Docker placeholders, and docs while app behavior remains unchanged.
115. Hosted Deployment Environment Checklist: backend/frontend hosted deployment commands, environment variables, startup order, Docker notes, and release checks are documented without provider lock-in.
116. Monitoring and Error Tracking Prep: monitoring intent now has a typed config resolver, env placeholders, docs, and structured unhandled-error logging without third-party SDK wiring.
117. Request Correlation Foundation: backend requests now receive or generate `X-Request-Id`, echo it in responses, and include it in structured request and unhandled-error logs.
118. Metrics Endpoint Placeholder: `/metrics` now has a disabled-by-default placeholder route with Prometheus-shaped output when enabled, plus monitoring docs and route tests.
119. Health Readiness Details: `/api/health` now reports lightweight readiness details for API, database configuration, background jobs, metrics, uptime, timestamp, and release version.
120. Background Job Runbook Expansion: background job docs now cover safe first-pass schedules, single-runner cautions, explicit job commands, and recovery steps.
121. Weekly Report Email Provider Prep: weekly report delivery planning now distinguishes SMTP/API email intent, records email provider metadata, and documents future provider credentials without sending external mail.
122. Push Provider Credentials Prep: push delivery planning now resolves disabled, prepared, and future web-push configurations with VAPID placeholders and docs while keeping real external push sending disabled.
123. AI Provider Configuration Hardening: AI insight provider config now reports rule/external HTTP readiness, endpoint status, API-key presence, and timeout intent while preserving rule-based fallback behavior.
124. External Provider Timeout Enforcement: external AI HTTP calls now abort after the configured timeout and continue to fall back to rule-based insights through the service.
125. AI Provider Observability Metadata: generated insights now store their provider source, the generate response includes provider metadata, a structured log entry is emitted per generation, and the frontend displays provider source per insight.
126. Scheduled Insight Generation Job: a new background job generates AI insights for active users with a 12-hour dedup window, provider fallback, providerSource tracking, and structured summary output.
127. Cosmetic Shop Purchasing Foundation: unowned cosmetics now expose derived coin prices, can be purchased early with coins, record spent coin transactions, and show buy/select controls on the profile page.
128. Achievement Unlock Animation Polish: realtime achievement unlocks now show an animated celebration banner with medal pulse, confetti pieces, auto-dismiss, and reduced-motion support.
129. Cosmetic Purchase History UX: cosmetic purchases now record item names in coin ledger reasons, and the rewards page surfaces recent cosmetic shop spending from coin history.
130. AI Prompt Version Metadata: manual and scheduled insight generation now include prompt version metadata, logs include the prompt version, and the insights page shows provider/prompt generation details.
131. AI Recommendation Scheduling UX: the insights page now shows manual/scheduled generation cadence, dedup window, next planned recommendation window, and provider/prompt status.
132. Richer Reward Chart Libraries: the rewards page now uses Recharts for XP trends, signed coin movement, and earned/spent coin-flow charts while keeping ledger export and history panels intact.
133. Avatar Customization Inventory UX: the profile page now has live avatar preview, cosmetic previewing, slot and ownership filters, grouped inventory browsing, rarity styling, and clearer unlock/price rules.
134. AI Prompt Version UX: the insights page now shows latest prompt run metadata, provider mix history, fallback status, and per-insight provider chips using the existing generation metadata.
135. AI Recommendation History UX: the insights page now has searchable, filterable, date-grouped recommendation history with type, provider, and feedback filters plus feedback summary counts.
136. Achievement Unlock History UX: the achievements page now has searchable, rarity-filtered, date-grouped unlock history with reward totals and per-unlock reward details.
137. Analytics Chart Library UX: the analytics page now uses Recharts for weekly outcome shape, monthly activity trends, and strongest activity days while keeping heatmap, CSV export, and recommendations intact.
138. Push Subscription Lifecycle Visibility: notifications now expose stored push subscription lifecycle metadata through the API and show active, failed, disabled, and updated browser subscription state in the UI.
139. AI Hosted Scheduling Controls: AI insights now expose schedule intent through an authenticated API and the insights page shows hosted/manual scheduler state, job name, provider, UTC windows, timezone, dedup window, and runner command.
140. AI Insight Learning Loop Signals: AI insights now summarize user feedback into provider and insight-type learning signals, expose them through an authenticated API, and show feedback quality guidance on the insights page.
141. Real Web Push Sender: backend push delivery now uses the `web-push` package when VAPID credentials are configured, sends notification payloads to stored subscriptions, and reports stale delivery failures for subscription cleanup.
142. Web Push Delivery Retries: real web-push delivery now supports configurable bounded retry attempts for transient failures while skipping retries for stale 404/410 subscriptions.
143. Web Push Credential Rotation Readiness: push delivery config now reports active VAPID key labels, optional next-key readiness, rotation start timestamps, and next public key metadata without exposing private rotation secrets.
144. Provider-Backed Analytics Recommendations: analytics recommendations now come from a backend endpoint with external HTTP provider support, prompt metadata, rule fallback, and frontend provider metadata display.
145. Real Weekly Report Email Delivery: weekly reports can now send through configured SMTP or generic email API providers, enforce credential readiness, retry bounded delivery attempts, and record delivery outcome metadata.
146. Achievement Notification Delivery UX: the notifications inbox now treats achievement unlocks as a first-class delivery lane with counts, category visuals, unread achievement status, and links back to the achievement hall.
147. Multi-Step Achievement Celebrations: achievement unlock banners now queue back-to-back unlocks and move through reveal, reward, and history stages before advancing or dismissing.
148. AI External Prompt Contract: external AI insight requests now include a versioned prompt contract with audience, max insight count, allowed insight types, instructions, and response schema hints.
149. AI Prompt Registry Status: AI insights now expose an authenticated prompt registry endpoint with provider readiness, prompt contract, audience, max insight count, and rollout notes.
150. AI Prompt Run History: manual and scheduled AI insight generations now persist prompt run metadata and expose recent authenticated prompt run history.
151. AI Scheduled Rollout Controls: scheduled AI insight generation now supports rollout percentage gating, external-provider-required blocking, status visibility, and frontend rollout readiness display.
152. AI Advanced Feedback Learning: AI learning summaries now combine feedback with prompt-run fallback signals, prompt-version health metrics, and actionable tuning guidance in the insights UI.
153. AI External Hosted Provider Profile: external AI insight rollout now has configurable hosted provider profile metadata, auth header/scheme settings, request-format visibility, status readiness, and UI/docs coverage.
154. Hosted Scheduler Plan Wiring: background jobs now expose a provider-neutral hosted scheduler JSON plan with explicit job commands, UTC cron defaults, enable flags, env overrides, and docs for platform scheduler setup.
155. Real Monitoring Provider Wiring: backend monitoring now uses prom-client metrics, Sentry SDK error capture, request/error metric instrumentation, and starter Grafana dashboard plus Prometheus alert artifacts.
156. Real Redis Runtime Clients: Redis is now wired as an optional runtime client for shared rate limits, distributed job locks, leaderboard cache, queue retry/dead-letter primitives, and health readiness status.
157. Hosted Deployment Pipeline and Infrastructure Runbook: production deployment now has a GitHub Actions deploy workflow, env/secret validator, deploy hook support, and a provider-neutral infrastructure and secret-manager runbook.
158. Auth Security Flows and Synopsis Adherence: project adherence to the synopsis is documented, and auth now includes two-step verification, profile security controls, forgot-password, and reset-password flows.
159. Auth Security Email Delivery: password reset and two-step verification now send real account security emails through SMTP, generic API, or local outbox delivery when configured.
160. User Cosmetic Marketplace: users can list owned cosmetics, buy active listings from other users with coins, cancel their own active listings, transfer ownership, update coin ledgers, and use the marketplace from the profile page.
161. Marketplace Listing Search: marketplace listings can be searched through validated backend query filters and a profile-page search control, reducing the remaining marketplace polish to moderation and trade-history exports.
162. Marketplace Moderation: admins can review recent marketplace listings, cancel active listings, and record those moderation actions in the admin audit history.
163. Marketplace Trade History Exports: admins can export marketplace listing history as CSV or PDF from the moderation panel, with export metadata recorded in admin report history.
164. Rule-Based Study Schedule Plan: insights now include a study-plan endpoint and UI that recommends focus blocks from active quests, due dates, overdue load, and recent focus minutes, while keeping trained ML scheduling as future polish.
165. Scheduling Training Signals: insights now expose recent quest outcome and focus-load signals for future trained scheduling, with readiness status and feature rows shown on the Insights page.
166. Super Admin Monitoring And Admin Session Hardening: super admins can view runtime/API/security health, admin routes re-check database role/status/two-step state, stale admin tokens are rejected after account changes, and admin promotions require two-step on the target account.
167. Admin Two-Step Bootstrap Recovery: admin and super-admin accounts without email delivery can generate time-limited bootstrap verification codes in the server console, then automatically enable two-step after successful verification.
168. Admin Bootstrap CLI: backend now has an `auth:admin-bootstrap` CLI command that generates a hashed, expiring admin verification code for a target admin/super-admin email without requiring SMTP.
169. Permanent Root Super Admin Guardrails: `ROOT_SUPER_ADMIN_EMAIL` now marks one immutable root super-admin, sensitive admin mutations require a fresh admin token, and only the protected root can grant or remove `SUPER_ADMIN`.
170. Super Admin Trusted Device Triple-Code Login: super-admin login now requires a backend-registered trusted device key plus three unique expiring one-time codes before an admin-verified token is issued.
171. Human Comment Polish Pass 1: high-value backend and frontend files now include concise human comments explaining architecture, security flows, quest rewards, AI scheduling, realtime rooms, monitoring, Redis, API handling, and admin UI intent.
172. Human Comment Polish Pass 2: guilds, leaderboards, analytics, reward/profile/guild UI pages, realtime hooks, job scheduling, and seed data now include selective comments explaining collaboration rules, caching, exports, scheduled jobs, and demo-safe setup.
173. Human Comment Polish Pass 3: focus sessions, achievements, abuse reports, quests/dashboard UI, notifications, shared UI primitives, quest/guild repositories, leaderboard cache, rate limiting, and error handling now include selective comments explaining reliability, moderation, timer, cache, and transaction decisions.
174. Unified Admin Device Triple-Code Login: admin and super-admin login now follows credentials, trusted admin device key, then three expiring codes; normal users still use one OTP when two-step is enabled.
175. UI/UX Foundation And Quest Command Shell: created the UI/UX blueprint and progress tracker, established a multi-accent gameful visual system with accessible motion, upgraded shared controls, and rebuilt app/auth shells with grouped navigation and a persistent player HUD.
176. UI/UX Dashboard Mission Control: rebuilt the dashboard around a prioritized next mission, compact status signals, urgency-aware quest queue, weekly momentum briefing, recent activity signals, and actionable loading/empty states.
177. UI/UX Quest And Focus Core Loop: rebuilt quest planning, filtering, rewards, and action feedback alongside a focus arena with clear modes, linked objectives, a dominant live timer, and durable run history.
178. UI/UX Character Progression And Collections: rebuilt profile, skills, achievements, and rewards around a character sheet, mastery paths, collection progress, closest milestones, and a coherent reward vault.

Verification pattern used after each fragment:

- `npm.cmd run typecheck`
- `npm.cmd run build`
- Prisma schema validation with a temporary local `DATABASE_URL`

Consolidated work after fragment 178 is recorded in
`PROJECT_LOG_2026-08_PRODUCT_RELEASE.md` so this historical file stays
manageable.
