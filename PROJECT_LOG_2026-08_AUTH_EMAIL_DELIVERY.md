# LevelUpX Auth Email Delivery Fragment

Completed: 2026-08-05

## Delivered

- Added pinned Mailpit `v1.30.6` to Docker Compose with localhost-only UI/API
  and SMTP ports, bounded message retention, SMTP test authentication, and a
  readiness health check.
- Enabled local SMTP delivery for password recovery, user OTP, and three-code
  admin login while keeping the same production email sender contract.
- Made console printing and development response disclosure secure opt-ins.
  Both are disabled in Docker, browser tests, and production examples.
- Changed Playwright auth workflows to retrieve fresh messages through the
  Mailpit integration endpoint. Tests also assert that no development token or
  code appears in the UI.
- Added Mailpit as a healthy GitHub Actions service for the browser job and
  documented the local-versus-hosted provider boundary.

## Verification

- Auth service unit tests: 12 passed, including explicit non-production secret
  suppression.
- Backend and frontend TypeScript checks passed; frontend lint passed.
- Playwright critical workflows: 6 passed using delivered SMTP messages.
- Docker Compose configuration parsed and all six services started; Mailpit
  and the backend reported healthy.
- A disposable production-mode account completed password-reset delivery.
  The HTTP response contained no reset token, the email contained a valid
  64-character token, and the account was deleted afterward.
- Recent backend logs contained zero auth-secret-shaped matches.

## Still Deferred

Mailpit is intentionally local and does not prove public deliverability. Before
launch, configure a hosted SMTP or auth-email API, verify the sending domain
and its SPF/DKIM/DMARC posture, repeat the recovery and privileged-login smoke
tests, and complete the other operator-owned items in `PROJECT_TODO.md`.
