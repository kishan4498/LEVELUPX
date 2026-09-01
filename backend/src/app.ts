import cors from "cors";
import express from "express";
import helmet from "helmet";

import { errorHandler } from "./common/middlewares/errorHandler.js";
import { notFoundHandler } from "./common/middlewares/notFoundHandler.js";
import { createRateLimiter } from "./common/middlewares/rateLimit.js";
import { requestIdMiddleware } from "./common/middlewares/requestId.js";
import { requestLogger } from "./common/middlewares/requestLogger.js";
import { getRedisClient, redisPurposeEnabled } from "./common/redis/redisClient.js";
import { RedisRateLimitStore } from "./common/redis/redisRateLimitStore.js";
import { env } from "./config/env.js";
import { resolveMonitoringRuntimeConfig } from "./config/monitoring.js";
import { resolveRedisRuntimeConfig } from "./config/redis.js";
import { abuseRouter } from "./modules/abuse/abuse.routes.js";
import { accountabilityRouter } from "./modules/accountability/accountability.routes.js";
import { accountRouter } from "./modules/account/account.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { achievementRouter, userAchievementRouter } from "./modules/achievements/achievement.routes.js";
import { aiInsightRouter } from "./modules/ai-insights/aiInsight.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { focusSessionRouter } from "./modules/focus-sessions/focusSession.routes.js";
import { guildRouter } from "./modules/guilds/guild.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { createMetricsRouter } from "./modules/health/metrics.routes.js";
import { leaderboardRouter } from "./modules/leaderboard/leaderboard.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { questRouter } from "./modules/quests/quest.routes.js";
import { productEventRouter } from "./modules/product-events/productEvent.routes.js";
import { rewardRouter } from "./modules/rewards/reward.routes.js";
import { userRouter } from "./modules/users/user.routes.js";

export function createApp() {
  const app = express();
  const redis = resolveRedisRuntimeConfig();
  const monitoring = resolveMonitoringRuntimeConfig();
  const origins = env.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const client = redisPurposeEnabled(redis, "rate-limit") ? getRedisClient(redis) : null;
  const mutationLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    store: client ? new RedisRateLimitStore(client, redis.namespace) : undefined
  });

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      exposedHeaders: ["Content-Disposition", "X-Request-Id"],
      origin(origin, done) {
        if (!origin || origins.includes(origin)) {
          done(null, true);
          return;
        }

        done(null, false);
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use("/api", mutationLimiter);

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/abuse-reports", abuseRouter);
  app.use("/api/accountability", accountabilityRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/achievements", achievementRouter);
  app.use("/api/users", userRouter);
  app.use("/api/users", userAchievementRouter);
  app.use("/api/quests", questRouter);
  app.use("/api/product-events", productEventRouter);
  app.use("/api/focus-sessions", focusSessionRouter);
  app.use("/api/rewards", rewardRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/ai-insights", aiInsightRouter);
  app.use("/api/guilds", guildRouter);
  app.use("/api/leaderboard", leaderboardRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/health", healthRouter);
  app.use(monitoring.metrics.path, createMetricsRouter(monitoring));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
