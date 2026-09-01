import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { AnalyticsController } from "./analytics.controller.js";
import { PrismaAnalyticsRepository } from "./analytics.repository.js";
import { AnalyticsService } from "./analytics.service.js";
import { createAnalyticsRecommendationProviderFromEnv, resolveAnalyticsRecommendationProviderConfig } from "./analyticsRecommendation.provider.js";

const repo = new PrismaAnalyticsRepository();
const providerCfg = resolveAnalyticsRecommendationProviderConfig();
const service = new AnalyticsService(
  repo,
  createAnalyticsRecommendationProviderFromEnv(),
  undefined,
  providerCfg.promptVersion
);
const controller = new AnalyticsController(service);

export const analyticsRouter = Router();

analyticsRouter.use(authMiddleware);

analyticsRouter.get("/weekly-summary", controller.weeklySummary);
analyticsRouter.get("/monthly-heatmap", controller.monthlyHeatmap);
analyticsRouter.get("/focus-consistency", controller.focusConsistency);
analyticsRouter.get("/recommendations", controller.recommendations);
