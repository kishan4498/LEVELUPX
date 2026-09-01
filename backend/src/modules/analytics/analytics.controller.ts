import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AnalyticsService } from "./analytics.service.js";

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  weeklySummary: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const summary = await this.service.compileWeeklyReport(auth.user!.id);

      return res.json({
        success: true,
        data: { summary }
      });
    } catch (error) {
      return next(error);
    }
  };

  monthlyHeatmap: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const heatmap = await this.service.generateMonthlyHeatmap(auth.user!.id);

      return res.json({
        success: true,
        data: { heatmap }
      });
    } catch (error) {
      return next(error);
    }
  };

  focusConsistency: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const consistency = await this.service.analyzeFocusConsistency(auth.user!.id);

      return res.json({
        success: true,
        data: { consistency }
      });
    } catch (error) {
      return next(error);
    }
  };

  recommendations: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const recommendations = await this.service.fetchAnalyticsRecommendations(auth.user!.id);

      return res.json({
        success: true,
        data: recommendations
      });
    } catch (error) {
      return next(error);
    }
  };
}
