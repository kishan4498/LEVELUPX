# Authentication And Privileged Access

LevelUpX separates normal user authentication from privileged admin access.
These controls reduce risk, but they still depend on HTTPS, protected secrets,
secure operator accounts, and monitored production infrastructure.

## User Login

Registration does not create an authenticated session. LevelUpX sends an
eight-digit email-verification code, stores only its bcrypt hash, and requires
the password and code before issuing tokens. The code expires after 15 minutes,
is replaced when resent, and is invalidated after five failed attempts.

After email ownership has been verified, the normal user flow is:

1. Email and password are verified.
2. If two-step is enabled, a six-digit one-time code is required.
3. A 15-minute access token is returned and an opaque refresh session is set in
   an HttpOnly cookie.

Only bcrypt hashes of passwords, reset tokens, and OTP values are stored.
Password reset tokens expire after 30 minutes. User OTP values expire after 10
minutes. Responses to forgotten-password requests do not reveal whether an
account exists. A valid password-reset email token also verifies ownership of
that address.

## Admin And Super-Admin Login

Both privileged roles use the same staged flow:

The frontend exposes this flow at `/admin/login`; the ordinary `/login` page
links to it but does not grant privileged access. If a normal `USER` account
completes the credential stages through the privileged entry, the frontend
revokes the resulting session and refuses to route it into the admin area.

1. Email and password.
2. A random trusted-device key registered by a backend operator.
3. Three unique six-digit codes from one expiring challenge.
4. WebAuthn passkey enrollment or verification before privileged operations.

The device key is shown once and only its bcrypt hash is stored. It is not a MAC
address. Web browsers do not expose a reliable MAC address, MAC values can be
spoofed, and network changes make them unsuitable as an authentication factor.

All three codes must match the same unused challenge and expire together. A new
challenge invalidates older pending challenges for that device. Successful
login records device use and produces an admin-verified token bound to that
trusted-device record. Admin API middleware still requires passkey step-up and
live database checks for the role, account status, mandatory two-step state,
and active device binding. Revoking or rotating that device therefore also
invalidates access tokens issued through its previous binding.

Two-step cannot be disabled while an identity has `ADMIN` or `SUPER_ADMIN`
status. The service rejects the request after password reauthentication, the
profile does not expose the disable action, and a PostgreSQL check constraint
prevents role and setting races from creating a privileged row with two-step
off. Migration deployment enables two-step on any legacy privileged row before
installing that constraint.

## Passkeys

Admin passkeys use the WebAuthn relying-party ID and origin configured in the
environment. Registration stores the credential public key and metadata, never
the authenticator's private key.

- An admin may enroll the first passkey after completing the device and
  three-code login.
- Existing passkeys must be verified before another passkey is added.
- Passkey authentication issues a fresh token with a passkey-verified claim.
- The last active admin passkey cannot be removed through the API.
- Production origins must use HTTPS and match the relying-party ID.

## Trusted Device Lifecycle

After passkey verification, `/admin/security` shows the active trusted devices
for the signed-in admin. The API returns only identifiers, labels, lifecycle
times, and whether a row is the current device; stored key hashes never leave
the backend.

- `GET /auth/admin-devices` requires a passkey-verified privileged session.
- `DELETE /auth/admin-devices/:id` additionally requires a fresh access token.
- The current device cannot revoke itself through the panel.
- The last active trusted device cannot be removed through the API.
- Revocation locks the owner's active device rows in one transaction, marks the
  selected device inactive, consumes its unfinished three-code challenges, and
  writes an `ADMIN_TRUSTED_DEVICE_REVOKED` audit row.
- LevelUpX sends a separate security email after successful revocation.
  Delivery failure is logged but cannot roll back the completed security
  action.

Registering an existing email/label pair rotates its random key. Rotation
consumes unfinished challenges and advances the binding version, so older
device-bound access tokens stop authorizing privileged requests.

## Tokens And Sessions

- Access tokens expire after 15 minutes and contain a unique `jti`.
- Access tokens are held in frontend memory, not local storage.
- Refresh credentials are random opaque values stored as hashes in the
  database and sent through HttpOnly cookies.
- Refresh sessions rotate on use; replaying a consumed token revokes the token
  family.
- Password changes, account deletion, logout, and session revocation remove
  refresh access as appropriate.
- Privileged refresh is intentionally blocked. Admins repeat the staged login
  for a fresh privileged session.

## Permanent Root Identity

`ROOT_SUPER_ADMIN_EMAIL` identifies the protected owner account. The Docker
template uses `kishanpansuriya4466@gmail.com`.

The admin panel cannot disable this identity or change its role. Only the
protected root can grant or remove `SUPER_ADMIN` on another account, and all
privileged mutations are recorded. Merely registering the configured address
does not promote it. Activation requires a matching password and the current
emailed verification code (or a valid emailed password-reset token). Role,
status, email-verification time, mandatory two-step state, and the
`ROOT_IDENTITY_ACTIVATED` audit row are committed atomically. No access or
refresh token is returned by that activation response, so the owner must next
complete the trusted-device, three-code, and passkey flow. There is
intentionally no application CLI that grants roles.

## Register A Trusted Device

With Docker running:

```powershell
docker compose exec backend npm run auth:admin-device -- --email kishanpansuriya4466@gmail.com --label owner-laptop
```

With a locally running backend environment:

```powershell
cd backend
npm run auth:admin-device -- --email kishanpansuriya4466@gmail.com --label owner-laptop
```

The command accepts only an active, email-verified `ADMIN` or `SUPER_ADMIN`
whose mandatory two-step setting is enabled. It prints the device key once and
stores only its bcrypt hash. Registration, rotation, and reactivation are
audited, unfinished challenges for a rotated device are consumed, and a
security notification is sent independently. Store the key in a password
manager. Re-running the command for the same email and label rotates that
device key.

## Auth Email Delivery

The local Docker stack sends email-verification codes, password-reset tokens,
user OTPs, and three-code admin challenges to Mailpit. Open
`http://localhost:8025` to read those local messages. Mailpit captures mail and
does not deliver it to a real mailbox.

Auth secrets are hidden from HTTP responses and logs by default. The two
development escape hatches are explicit opt-ins and must remain disabled for
normal development, CI, and every hosted environment:

```dotenv
AUTH_EMAIL_DELIVERY_ENABLED=true
AUTH_EMAIL_PRINT_CODES_TO_CONSOLE=false
AUTH_DEV_DISCLOSE_CODES=false
```

`AUTH_EMAIL_PRINT_CODES_TO_CONSOLE=true` is reserved for a short, controlled
bootstrap when no delivery channel exists. It should be reverted immediately
after use. `AUTH_DEV_DISCLOSE_CODES=true` exists only for narrowly scoped unit
tests and is also ignored when `NODE_ENV=production`.

A public deployment must replace Mailpit with verified SMTP or an email API.
Provider settings are documented in `docs/environment.md`.

## Recovery

Passkey or last-device recovery is a backend operator procedure. Verify the
owner out of band, preserve the audit trail, rotate affected device keys and
sessions, and enroll a new passkey. A passkey-verified admin can revoke another
trusted device from `/admin/security` without operator database access. Never
add a password-only bypass to the admin panel.
