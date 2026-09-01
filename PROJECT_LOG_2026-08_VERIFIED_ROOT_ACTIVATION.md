# Verified Email And Root Activation

Completed on 2026-08-05.

## What Changed

- Registration now sends an eight-digit verification code and returns no
  access or refresh session until the address is verified.
- Verification codes are stored as bcrypt hashes, expire after 15 minutes,
  rotate on resend, and are invalidated after five failed attempts.
- Verification codes and password-reset tokens are consumed by conditional
  database updates, so concurrent requests cannot reuse one credential or
  duplicate a root-activation audit record.
- An unverified password login starts the same verification flow before user
  OTP, admin device checks, or token issuance.
- A valid password-reset email token also marks the address verified.
- The fixed `ROOT_SUPER_ADMIN_EMAIL` activates only after password and email
  proof. Activation atomically sets `SUPER_ADMIN`, active status, mandatory
  two-step state, and a `ROOT_IDENTITY_ACTIVATED` audit row.
- Root activation and privileged password reset deliberately return no session.
  The next login still requires the trusted device, three emailed codes, and a
  WebAuthn passkey.
- Admin promotion now rejects accounts whose email ownership is unverified,
  and privileged middleware rechecks that state in the database.
- Registration, login, reset, admin management, Mailpit helpers, and browser
  fixtures were updated for the new response contracts.

## Database Change

Migration `20260805120000_verified_email_root_activation` adds the verification
timestamp, code hash, expiry, and bounded-attempt fields. Existing identities
are intentionally not marked verified by the migration. They must prove email
ownership on their next password login; privileged middleware blocks an
unverified admin immediately.

## Verification

- Prisma schema validation passed.
- Backend lint and type checking passed.
- Backend unit suite: 43 files, 218 tests passed.
- Backend HTTP integration suite: 5 tests passed.
- Database suite: 2 files and 3 tests passed, including concurrent one-time
  verification and reset-token consumption.
- Frontend lint, type checking, and unit tests passed.
- Playwright: 7 critical workflows passed against isolated PostgreSQL and
  Mailpit services.
- The browser-created root was confirmed as active `SUPER_ADMIN`, verified,
  two-step enabled, and linked to the expected activation audit method.
- The Docker production builds passed, all six services are running, and a
  disposable deployed signup proved session withholding, Mailpit delivery,
  verification, token issuance, and account cleanup through ports 3000/4000.

## Still Deferred

The real `kishanpansuriya4466@gmail.com` identity has not been created because
the project must not invent or retain the owner's password. Hosted SMTP,
verified-domain delivery, trusted-device registration, two root passkeys, and
the out-of-band recovery ceremony remain in `PROJECT_TODO.md`.
