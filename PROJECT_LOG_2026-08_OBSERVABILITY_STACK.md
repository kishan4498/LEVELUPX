# Local Observability Stack

Completed on 2026-08-05.

## What Changed

- The Prometheus metrics endpoint now fails closed and requires a timing-safe
  bearer-token check. Docker mounts the same ignored secret into the backend
  and Prometheus without placing it in Compose environment output.
- Metrics paths and secrets are validated; tokens shorter than 32 characters
  never enable scraping.
- A typed Prometheus HTTP client now reads target state, five-minute request
  volume, error rate, p95 latency, one hour of request-rate history, and active
  alerts with bounded timeouts and partial-failure handling.
- Super-admin health is asynchronous and risk-aware. A down scrape target,
  unreachable or misconfigured Prometheus, recent server errors, or a critical
  alert raises `RISK`; partial data and warning alerts raise `WATCH`.
- The security-gated admin console now includes live telemetry, a stable
  historical chart, alert details, automatic and manual refresh, and links to
  the local operational tools.
- Docker Compose now runs pinned Prometheus, Alertmanager, and Grafana
  containers with persistent named volumes and localhost-only host ports.
- Prometheus has 15-second scraping/evaluation, seven-day and 1 GB retention,
  three recording rules, and five actionable alert rules.
- Alertmanager groups local alerts and delivers them to
  `operator@levelupx.local` through Mailpit.
- Grafana provisions its Prometheus data source and the versioned
  `LevelUpX Operational Overview` dashboard without manual imports.
- The local environment generator now creates the ignored scrape secret and a
  random first-run Grafana password while preserving established database and
  Grafana credentials during `--force` JWT rotation.
- Hosted deployment validation now fails when enabled metrics lack a scrape
  credential or Prometheus URL, and rejects weak tokens, invalid providers,
  malformed paths, and non-HTTP(S) query endpoints. GitHub Actions passes the
  secret and observability URLs through the production environment contract.
- Mobile verification exposed an older min-content overflow in the reward
  source table. The admin scrollers and mobile navigation now stay within a
  390px viewport while retaining intentional horizontal table navigation.

## Verification

- Backend and frontend type checks and zero-warning lint passed.
- Backend unit suite: 47 files and 240 tests passed.
- Backend HTTP integration suite: 1 file and 5 tests passed.
- Database suite: 3 files and 7 tests passed.
- Frontend unit suite: 3 files and 3 tests passed.
- Playwright: all 7 critical workflows passed. The privileged workflow also
  passed independently with the new 390px no-page-overflow assertion.
- Backend and frontend production Docker builds passed; all 24 migrations were
  already applied.
- `docker compose config --quiet` passed.
- Deployment validator syntax checks and all 4 focused monitoring-contract
  tests passed.
- `promtool` validated the Prometheus configuration and all 8 recording/alert
  rules; `amtool` validated the Alertmanager configuration.
- The protected metrics endpoint returned `401` without credentials while
  Prometheus authenticated successfully and reported
  `up{job="levelupx-backend"} = 1`.
- The recorded request-rate query returned live data.
- Grafana 13.1.0 reported a healthy database and exposed the provisioned
  `levelupx-overview` dashboard.
- A controlled Alertmanager verification alert arrived in Mailpit for
  `operator@levelupx.local`.
- All nine Compose services are running; health-checked services report
  healthy status.

## Still Deferred

This fragment completes local metrics, dashboards, rule evaluation, alert
grouping, and local email delivery. Production still needs private or managed
observability infrastructure, HTTPS and SSO/reverse-proxy protection, a real
on-call receiver, a configured error-tracking account, centralized logs, SIEM
routing, external uptime checks, and production retention/backup decisions.
Those items remain in `PROJECT_TODO.md`.
