# LevelUpX Project Log

Read this file first when resuming work.

- Current consolidated release: `PROJECT_LOG_2026-08_PRODUCT_RELEASE.md`
- Latest completed fragment: `PROJECT_LOG_2026-08_OBSERVABILITY_STACK.md`
- Earlier fragment history: `PROJECT_HISTORY.md`
- Intentionally deferred work: `PROJECT_TODO.md`
- UI source of truth: `UI_UX_BLUEPRINT.md` and `UI_UX_PROGRESS.md`

## Current Status

LevelUpX now runs as a complete local Docker product with a Next.js web app,
Express API, PostgreSQL, Redis, a dedicated scheduler, Prometheus,
Alertmanager, Grafana, and Mailpit. The principal synopsis workflows,
practical daily-use additions, offline capture, account controls, product
monitoring, and layered admin security are implemented.

The consolidated product release is complete. Critical browser workflows run
through Playwright locally and in CI with isolated test data. Local Docker and
browser tests now use a real SMTP exchange with Mailpit; auth secrets are
hidden from HTTP responses and logs by default. Registration now withholds all
sessions until email ownership is verified. The configured root can activate
only through that proof, is immediately signed out, and must still complete the
trusted-device, three-code, and passkey sequence.

Privileged two-step is now a database invariant as well as an application
policy. Admin and super-admin identities cannot disable it through the API or
profile, and concurrent role/security updates cannot leave an invalid row.

Privileged access is also bound to the trusted device that completed login.
The passkey-gated security page exposes a metadata-only device inventory and
can revoke another device while preserving the current and final active
devices. Rotation and revocation invalidate stale authorization, consume
unfinished challenges, write audit events, and trigger security notices.

Local observability is now operational rather than a starter placeholder.
Prometheus securely scrapes the protected backend endpoint and persists
history, Alertmanager evaluates and routes local notifications to Mailpit, and
Grafana starts with a provisioned dashboard. The super-admin console reads
historical request, error, latency, target, and alert state through a typed
timeout-bounded backend client.

## Resume Point

Choose the next item from `PROJECT_TODO.md`. The root activation code path is
complete, but the real owner identity is intentionally not created without its
password and email proof. Public-production work should continue with owner
activation, physical device and passkey enrollment, a rehearsed out-of-band
recovery ceremony, a hosted email provider and verified sending domain,
HTTPS/WebAuthn origins, managed secrets, hosted observability, centralized
logs, and a real on-call destination. Do not represent those operator and
infrastructure steps as already complete.

Do not expand the old history file for consolidated release work. Add a new
dated log when another major release begins.
