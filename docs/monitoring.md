# Monitoring and Local Observability

LevelUpX has a reproducible local monitoring stack instead of dashboard
placeholders. Docker Compose runs Prometheus, Alertmanager, and Grafana beside
the application services, while Mailpit acts as the local alert destination.

## Runtime Shape

| Service | Local URL | Purpose |
| --- | --- | --- |
| LevelUpX | `http://localhost:3000` | Application and super-admin health view |
| API health | `http://localhost:4000/api/health` | Lightweight liveness and readiness |
| Grafana | `http://localhost:3001` | Provisioned operational dashboard |
| Prometheus | `http://localhost:9090` | Metrics queries, targets, and rules |
| Alertmanager | `http://localhost:9093` | Alert grouping and delivery state |
| Mailpit | `http://localhost:8025` | Local auth and alert email inbox |

Prometheus, Grafana, Alertmanager, and Mailpit bind to `127.0.0.1`. They are
development tools and must not be exposed directly to an untrusted network.

## First Run

Generate the ignored local environment and monitoring secret:

```powershell
node scripts/create-local-env.mjs
```

The generator creates:

- random JWT access and refresh secrets in `.env`;
- a random first-run Grafana password in `.env`;
- an ignored Prometheus scrape token at
  `ops/monitoring/secrets/metrics-token.local`;
- a random PostgreSQL password on first setup.

Start the stack:

```powershell
docker compose up --build -d
docker compose ps
```

The Grafana username and password are the `GRAFANA_ADMIN_USER` and
`GRAFANA_ADMIN_PASSWORD` values in the ignored `.env` file. Anonymous access
and self-registration are disabled.

## Signal Flow

1. The backend records request counters, duration histograms, unhandled-error
   counters, process metrics, and build metadata through `prom-client`.
2. `GET /metrics` requires the shared bearer token. Missing or invalid
   credentials return `401`; enabled metrics without a valid local secret fail
   closed with `503`.
3. Prometheus reads the token from its Docker secret and scrapes the backend
   every 15 seconds.
4. Recording rules calculate request rate, 5xx ratio, and p95 latency.
5. Alert rules are evaluated every 15 seconds and sent to Alertmanager.
6. Alertmanager groups notifications and sends local messages to
   `operator@levelupx.local` through Mailpit.
7. Grafana reads Prometheus through its provisioned server-side data source.
8. The protected super-admin health endpoint queries Prometheus with a bounded
   timeout and returns current metrics, one hour of request-rate history, and
   active alerts.

The small in-memory recent-request list remains available in the admin panel.
Prometheus owns historical metrics across backend restarts.

## Super-Admin View

`GET /api/admin/system-health` remains behind the complete privileged access
policy. A caller must have a valid device-bound admin token and satisfy the
admin middleware checks; normal users and ordinary admins cannot use the
super-admin monitoring route.

The admin console shows backend/dependency readiness, scrape-target state,
five-minute request and error signals, p95 latency, one hour of request-rate
history, active alerts, operational links, recent requests, and the existing
security posture.

The summary becomes `RISK` when the database is unconfigured, protected
metrics are misconfigured, Prometheus is unreachable, the API target is down,
a server error was recently observed, or a critical alert is active. Partial
Prometheus data and warning alerts produce `WATCH`.

## Persistence and Rules

Prometheus keeps seven days of data with a 1 GB local cap. Prometheus,
Alertmanager, and Grafana each use a named Docker volume, so normal container
recreation does not erase their state.

Current alerts:

- `LevelUpXApiDown`
- `LevelUpXHighApiErrorRate`
- `LevelUpXHighApiLatency`
- `LevelUpXUnhandledErrors`
- `LevelUpXHighMemory`

The error-rate and latency alerts include a minimum traffic condition so an
idle local environment does not create misleading noise.

## Repository Files

| Path | Ownership |
| --- | --- |
| `ops/monitoring/prometheus/prometheus.yml` | Scrape and Alertmanager wiring |
| `ops/monitoring/prometheus/levelupx.rules.yml` | Recording and alert rules |
| `ops/monitoring/alertmanager/alertmanager.yml` | Local Mailpit receiver |
| `ops/monitoring/grafana/provisioning/` | Data source and dashboard provider |
| `ops/monitoring/grafana/dashboards/levelupx-overview.json` | Versioned dashboard |
| `backend/src/config/observability.ts` | URL, timeout, and link validation |
| `backend/src/common/monitoring/prometheusMonitoring.ts` | Typed Prometheus API client |

The older starter files under `docs/monitoring/` remain historical reference
artifacts. The runnable source of truth is under `ops/monitoring/`.

## Environment

```bash
SERVICE_NAME=levelupx-api
RELEASE_VERSION=docker-local
ERROR_TRACKING_ENABLED=false
ERROR_TRACKING_PROVIDER=none
ERROR_TRACKING_DSN=
METRICS_ENABLED=true
METRICS_PROVIDER=prometheus
METRICS_PATH=/metrics
METRICS_AUTH_TOKEN_FILE=/run/secrets/levelupx_metrics_token
PROMETHEUS_URL=http://prometheus:9090
PROMETHEUS_PUBLIC_URL=http://localhost:9090
GRAFANA_PUBLIC_URL=http://localhost:3001/d/levelupx-overview/levelupx-operational-overview
ALERTMANAGER_PUBLIC_URL=http://localhost:9093
OBSERVABILITY_QUERY_TIMEOUT_MS=3000
```

Use `METRICS_AUTH_TOKEN` for a secret-manager-injected value or
`METRICS_AUTH_TOKEN_FILE` for a mounted secret file. The resolved token must be
at least 32 characters. Public links accept only HTTP or HTTPS URLs, and the
query timeout is bounded between 500 and 10,000 milliseconds.

## Validation

Validate Compose and the provider-native configuration files:

```powershell
docker compose config --quiet
docker compose run --rm --no-deps --entrypoint promtool prometheus check config /etc/prometheus/prometheus.yml
docker compose run --rm --no-deps --entrypoint amtool alertmanager check-config /etc/alertmanager/alertmanager.yml
```

Check live readiness:

```powershell
curl.exe -i http://localhost:4000/metrics
curl.exe http://localhost:9090/-/ready
curl.exe http://localhost:9093/-/ready
curl.exe http://localhost:3001/api/health
```

The first command should return `401` without the scrape token. Prometheus
should show `backend:4000` as `UP` on its targets page.

Useful logs:

```powershell
docker compose logs -f backend prometheus alertmanager grafana
```

## Rotation

Running the generator with `--force` rotates the local JWTs and Prometheus
scrape token while preserving an established PostgreSQL password and Grafana
login:

```powershell
node scripts/create-local-env.mjs --force
docker compose up -d --force-recreate backend scheduler prometheus
```

JWT rotation invalidates existing application sessions. The backend and
Prometheus must restart together after scrape-token rotation.

## Production Boundary

The repository now contains a complete local metrics, dashboard, and alert
delivery path. Public production still requires operator-owned infrastructure:

- private networking, HTTPS, and SSO or an authenticated reverse proxy for
  Prometheus, Grafana, and Alertmanager;
- a hosted or managed metrics deployment with production retention and
  backups;
- a verified on-call destination instead of Mailpit;
- a real Sentry DSN or another error tracker;
- centralized logs, SIEM routing, and external uptime checks.

Those external services remain explicit in `PROJECT_TODO.md`.
