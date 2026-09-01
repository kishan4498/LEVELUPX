# Privileged Two-Step Invariant

Completed on 2026-08-05.

## What Changed

- `ADMIN` and `SUPER_ADMIN` accounts now receive a stable
  `PRIVILEGED_TWO_STEP_REQUIRED` rejection if they try to disable two-step.
- The repository performs standard-user disablement as a role-conditional
  write, closing the read-to-write promotion race.
- Migration `20260805123000_privileged_two_step_invariant` repairs any legacy
  privileged row with two-step off and adds a PostgreSQL check constraint that
  prevents the state from returning.
- The profile replaces the privileged disable form with a locked policy state
  and a direct route to passkey security.
- Browser fixtures now create the super-admin in a valid state from the first
  database write rather than repairing it afterward.

## Verification

- Backend and frontend type checks and zero-warning lint passed.
- Backend unit suite: 43 files and 220 tests passed.
- Backend HTTP integration suite: 5 tests passed.
- Database suite: 2 files and 5 tests passed, including direct rejection for
  both privileged roles.
- Frontend unit suite: 3 tests passed.
- Playwright: all 7 critical workflows passed, including the locked privileged
  profile state.
- Docker production builds passed, migration 23 applied to `public`, and all
  six services are running. A live disposable transaction confirmed that the
  validated constraint rejects the invalid role update and rolls back cleanly.

## Still Deferred

The real root account, physical trusted devices, two owner passkeys, and an
out-of-band recovery ceremony still require owner or operator participation.
Hosted email, HTTPS infrastructure, and external monitoring remain listed in
`PROJECT_TODO.md`.
