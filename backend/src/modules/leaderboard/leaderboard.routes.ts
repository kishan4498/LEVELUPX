import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { getRedisClient, redisPurposeEnabled } from "../../common/redis/redisClient.js";
import { resolveRedisRuntimeConfig } from "../../config/redis.js";
import { RedisLeaderboardCache } from "./leaderboard.cache.js";
import { LeaderboardController } from "./leaderboard.controller.js";
import { PrismaLeaderboardRepository } from "./leaderboard.repository.js";
import { LeaderboardService } from "./leaderboard.service.js";
import { guildLeaderboardParamsSchema, leaderboardQuerySchema } from "./leaderboard.validation.js";

const repo = new PrismaLeaderboardRepository();
const redis = resolveRedisRuntimeConfig();
const client = redisPurposeEnabled(redis, "leaderboard-cache") ? getRedisClient(redis) : null;
const cache = client ? new RedisLeaderboardCache(client, redis.namespace) : undefined;
const service = new LeaderboardService(repo, cache);
export const leaderboardController = new LeaderboardController(service);

export const leaderboardRouter = Router();

leaderboardRouter.use(authMiddleware);

leaderboardRouter.get("/", validateRequest({ query: leaderboardQuerySchema }), leaderboardController.global);

export const guildLeaderboardRoute = [
  validateRequest({ params: guildLeaderboardParamsSchema, query: leaderboardQuerySchema }),
  leaderboardController.guild
];
