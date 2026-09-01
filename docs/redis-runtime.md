# Redis Runtime

Redis is an optional production add-on for LevelUpX. The app still runs without Redis when `REDIS_ENABLED=false`, but real Redis clients are now available for shared rate limiting, leaderboard cache, job queue primitives, retry/dead-letter handling, and distributed job locks.

## Environment

```bash
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379
REDIS_NAMESPACE=levelupx
REDIS_PURPOSES=rate-limit,job-queue,leaderboard-cache,distributed-lock
```

- `REDIS_ENABLED`: set `true` only when a real Redis service is available.
- `REDIS_URL`: managed Redis connection string. Use `rediss://` when the provider requires TLS.
- `REDIS_NAMESPACE`: key prefix for this app and environment, for example `levelupx-prod`.
- `REDIS_PURPOSES`: comma-separated intended uses.

Supported purposes are:

- `rate-limit`: shared request counters across backend instances.
- `job-queue`: BullMQ-style background job queues and retries.
- `leaderboard-cache`: fast leaderboard snapshot reads.
- `distributed-lock`: one-at-a-time scheduled job execution across multiple workers.

## Current Behavior

When Redis is disabled:

- Rate limiting uses process-local memory.
- Background jobs run sequentially from the CLI runner.
- Leaderboard snapshots are persisted in PostgreSQL.
- No Redis network connection is required.

When Redis is enabled and the related purpose is present:

- `rate-limit`: mutation API rate limits use Redis counters shared across backend instances.
- `leaderboard-cache`: leaderboard responses are cached briefly in Redis and invalidated after snapshot refresh.
- `distributed-lock`: background jobs acquire a Redis lock before running so multiple scheduler workers do not run the same job at once.
- `job-queue`: `RedisJobQueue` provides enqueue, lease, complete, retry, and dead-letter primitives for worker-style job processing.

## Operational Notes

- Use `rediss://` when the Redis provider requires TLS.
- Keep `REDIS_NAMESPACE` unique per environment to avoid shared counters, locks, and queues across staging/production.
- Keep only one scheduler responsible for each job unless `distributed-lock` is enabled and Redis connectivity is healthy.
- PostgreSQL remains the source of truth for leaderboard data; Redis only caches serialized response rows.
- Durable worker processes that continuously drain Redis queues can be added later on top of `RedisJobQueue`.

The backend config resolver lives in `src/config/redis.ts`. Redis client primitives live under `src/common/redis`.
