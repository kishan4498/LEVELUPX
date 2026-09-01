# CI Browser Workflow Fragment

Completed on 2026-08-05.

## Delivered

- Added Playwright browser coverage for registration and onboarding, regular
  email OTP, password recovery, offline quest replay, data export and account
  deletion, and the complete privileged login path.
- The privileged path exercises password, trusted device key, all three
  short-lived codes, passkey enrollment, the admin console, system health, and
  recent API request monitoring.
- Added a guarded fixture launcher that requires `NODE_ENV=test`,
  `LEVELUPX_E2E=true`, and the `levelupx_e2e` PostgreSQL schema before it can
  reset or create identities. It cannot seed the normal application schema.
- Added a GitHub Actions browser job with PostgreSQL, pinned Playwright
  Chromium, one worker, and retained HTML/trace evidence.
- Fixed the account export contract so cross-origin browsers can read
  `Content-Disposition` and preserve the server-provided JSON filename.

## Commands

From `frontend`:

```powershell
npx playwright install chromium
npm run test:e2e
```

The suite owns ports `3100` and `4100`; it does not replace the normal Docker
ports `3000` and `4000`.

## Verification

- Playwright: 1 file, 6 critical browser workflows passed.
- Backend unit tests: 43 files, 214 tests passed.
- Backend HTTP integration: 1 file, 5 tests passed.
- Frontend unit tests: 3 files, 3 tests passed.
- Backend and frontend typechecks, lints, and production builds passed.
- Dependency installation audits reported zero known vulnerabilities for both
  workspaces.

## Remaining Work

At the time this fragment closed, the tests used development-only OTP/reset
disclosure. `PROJECT_LOG_2026-08_AUTH_EMAIL_DELIVERY.md` records the later
replacement with Mailpit-backed SMTP checks. The suite still uses a virtual
passkey; root ownership verification, physical passkey enrollment, hosted
infrastructure, and operator recovery drills are not represented as complete.
