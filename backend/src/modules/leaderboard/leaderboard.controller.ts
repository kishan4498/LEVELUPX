import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { LeaderboardService } from "./leaderboard.service.js";
import type { LeaderboardQueryInput } from "./leaderboard.types.js";

export class LeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  global: RequestHandler = async (req, res, next) => {
    try {
      const leaderboard = await this.service.getGlobal(req.query as unknown as LeaderboardQueryInput);

      return res.json({
        success: true,
        data: { leaderboard }
      });
    } catch (error) {
      return next(error);
    }
  };

  guild: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const leaderboard = await this.service.getGuild(
        auth.user!.id,
        String(req.params.id),
        req.query as unknown as LeaderboardQueryInput
      );

      return res.json({
        success: true,
        data: { leaderboard }
      });
    } catch (error) {
      return next(error);
    }
  };
}
