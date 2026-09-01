# LevelUpX Todo / Intentionally Deferred

The local product is feature-complete for the current synopsis. The items below
need external services, production infrastructure, real usage data, or an
operator decision. They are kept visible so later work is not mistaken for
finished work.

## Before Public Production

- Activate the fixed root account through the registration/email-verification
  flow and confirm its `ROOT_IDENTITY_ACTIVATED` audit row. The code path is
  complete, but the real owner account has not been created in this workspace.
- Register the root owner's physical trusted device, enroll at least two
  passkeys, and rehearse the documented out-of-band last-device/passkey
  recovery ceremony. Device inventory, guarded revocation, session binding,
  mandatory privileged two-step, and audit/notification paths are implemented;
  real factor enrollment still requires the owner.
- Replace the local Mailpit sink with a production SMTP or auth-email API,
  verify the sending domain and deliverability controls, then repeat password
  recovery and all four login stages against that provider. Keep both auth
  secret disclosure switches disabled.
- Deploy behind HTTPS with final CORS and WebAuthn origins, managed PostgreSQL
  and Redis, a secret manager, encrypted backups, restore drills, and key
  rotation.
- Move the working local Prometheus/Grafana/Alertmanager stack to private
  production infrastructure or managed equivalents, with SSO/reverse-proxy
  protection, production retention, backups, and a verified on-call receiver.
- Configure a real Sentry DSN or another error tracker, centralized logs, SIEM
  routing, and external uptime checks. Local metrics, dashboards, rule
  evaluation, and Mailpit alert delivery are implemented; these hosted
  accounts and operator destinations are not.
- Configure VAPID web-push credentials and test browser permission, retry,
  invalid-subscription cleanup, and notification delivery.
- Choose hosted object storage for reports and a hosted scheduler; disable the
  Docker local scheduler when hosted schedules take ownership.
- Complete privacy, retention, terms, abuse-response, and data-deletion policy
  review before inviting real users.

## Later Product Work

- Train and validate personalization models after enough consented usage data
  exists; current planning and burnout guidance is intentionally rule based.
- Add native mobile packaging only after PWA retention and notification
  reliability justify the maintenance cost.
- Add organization billing or enterprise identity only when a real customer
  workflow requires it.

## Ongoing Maintenance

- Keep dependencies, container images, browser support, and WebAuthn behavior
  reviewed on a regular release cadence.
- Expand focused tests whenever a shared contract or high-risk workflow changes.
- Continue human-oriented comments only where intent is not obvious; avoid
  turning straightforward code into narrated code.
