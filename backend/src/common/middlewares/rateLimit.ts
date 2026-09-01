import type { Request, RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import type { RateLimitStore } from "../redis/redisRateLimitStore.js";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  message?: string;
  methods?: string[];
  keyGenerator?: (req: Request) => string;
  now?: () => number;
  store?: RateLimitStore;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(limits: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const methods = limits.methods ? new Set(limits.methods.map((method) => method.toUpperCase())) : null;
  const now = limits.now ?? Date.now;
  const keyGenerator = limits.keyGenerator ?? ((req) => req.ip ?? "unknown");

  return async (req, res, next) => {
    if (methods && !methods.has(req.method.toUpperCase())) {
      return next();
    }

    const time = now();
    const key = keyGenerator(req);
    const bucket = limits.store
      ? await limits.store.hit({ key, windowMs: limits.windowMs, now: time })
      : hitMemoryBucket({
          buckets,
          key,
          windowMs: limits.windowMs,
          now: time
        });

    const remaining = Math.max(0, limits.maxRequests - bucket.count);
    res.setHeader("RateLimit-Limit", String(limits.maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > limits.maxRequests) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - time) / 1000)));
      return next(new AppError(limits.message ?? "Too many requests", 429, "RATE_LIMIT_EXCEEDED"));
    }

    return next();
  };
}

function hitMemoryBucket(hit: {
  buckets: Map<string, Bucket>;
  key: string;
  windowMs: number;
  now: number;
}): Bucket {
  const current = hit.buckets.get(hit.key);
  // Lazy expiry avoids a cleanup job and keeps tests deterministic.
  const bucket =
    current && current.resetAt > hit.now
      ? current
      : {
          count: 0,
          resetAt: hit.now + hit.windowMs
        };

  bucket.count += 1;
  hit.buckets.set(hit.key, bucket);

  return bucket;
}
