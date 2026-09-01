# Trusted Device Lifecycle

Completed on 2026-08-05.

## What Changed

- Privileged JWTs now carry the trusted-device identifier that completed the
  device and three-code login stages plus its exact binding version.
- Migration `20260805133000_trusted_device_binding_version` adds the
  database-backed version and a positive-value constraint.
- Admin middleware verifies that binding against the database on every
  privileged request. Revoked devices and keys rotated after token issuance no
  longer authorize admin access.
- The passkey step-up token preserves the same device binding.
- First-time passkey setup renews the device-bound token after assigning the
  WebAuthn user identifier, so strict account-change invalidation does not
  interrupt the in-progress ceremony.
- `/admin/security` now includes a metadata-only active-device inventory.
- A passkey-verified admin with a fresh token can revoke another device. The
  service protects the current device and the final active device.
- Device revocation is transactional: active rows are locked, unfinished
  three-code challenges are consumed, and an admin audit row is written before
  the change commits.
- Successful revocation sends an independent account-security notification.
- The backend provisioning command now validates its inputs and account
  security state, audits registration/rotation/reactivation, consumes pending
  challenges on key rotation, advances the binding version, and sends a
  security notice.
- Browser coverage exercises inventory, guarded controls, revocation email,
  and rejection of the revoked key through the real Mailpit flow.
- The Playwright frontend has a dedicated launcher and realistic cold-start
  budget; generated reports and traces are excluded from source lint.

## Verification

- Backend and frontend type checks and zero-warning lint passed.
- Backend unit suite: 45 files and 230 tests passed.
- Backend HTTP integration suite: 5 tests passed.
- Database suite: 3 files and 7 tests passed, including concurrent revocation
  attempts that preserve one active device.
- Frontend unit suite: 3 tests passed.
- Playwright: all 7 critical workflows passed, including device revocation,
  real SMTP notification capture, and rejected login with the revoked key.
- Docker production builds passed, all 24 migrations are applied, all six
  services are running, the API reports ready database/Redis/scheduler state,
  and the rendered login route returns `200`.

## Still Deferred

The real root account and physical factors are intentionally not provisioned
without owner participation. The owner must activate the configured identity,
register its real device, enroll at least two passkeys, and rehearse the
out-of-band recovery ceremony. Hosted email, HTTPS infrastructure, managed
secrets, and external monitoring remain in `PROJECT_TODO.md`.
