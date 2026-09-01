# Push Delivery

LevelUpX can store browser push subscriptions today. Real web-push delivery is still a future fragment.

## Current Behavior

- The frontend subscribes only when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is configured.
- The backend stores push subscription endpoint and keys.
- Notification delivery uses a provider boundary.
- `PUSH_DELIVERY_PROVIDER=disabled` sends nothing.
- `PUSH_DELIVERY_PROVIDER=prepared` exercises the local provider boundary without external delivery.
- `PUSH_DELIVERY_PROVIDER=web-push` records future VAPID configuration readiness, but still does not send through a web-push library yet.

## Environment

Backend:

```bash
PUSH_DELIVERY_PROVIDER=disabled
PUSH_VAPID_PUBLIC_KEY=
PUSH_VAPID_PRIVATE_KEY=
PUSH_VAPID_SUBJECT=
```

Frontend:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

Use the same VAPID public key on backend and frontend. Keep `PUSH_VAPID_PRIVATE_KEY` secret and server-only. `PUSH_VAPID_SUBJECT` should be a contact URI such as `mailto:admin@example.com`.

## Later Wiring

Real web-push sending, stale subscription retry policy, provider-level failures, and hosted credential rotation remain future fragments.
