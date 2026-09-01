import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AchievementService } from "./achievement.service.js";

export class AchievementController {
  constructor(private readonly service: AchievementService) {}

  fetchCatalog: RequestHandler = async (_req, res, next) => {
    try {
      const achievements = await this.service.fetchCatalog();

      return res.json({
        success: true,
        data: { achievements }
      });
    } catch (error) {
      return next(error);
    }
  };

  listMine: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const achievements = await this.service.fetchEarnedAchievements(auth.user!.id);

      return res.json({
        success: true,
        data: { achievements }
      });
    } catch (error) {
      return next(error);
    }
  };

  listProgress: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const achievements = await this.service.fetchAchievementProgress(auth.user!.id);

      return res.json({
        success: true,
        data: { achievements }
      });
    } catch (error) {
      return next(error);
    }
  };
}
