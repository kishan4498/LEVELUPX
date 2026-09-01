import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { RewardReadService } from "./reward.service.js";
import type { RewardHistoryInput } from "./reward.types.js";

export class RewardController {
  constructor(private readonly service: RewardReadService) {}

  summary: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const summary = await this.service.fetchPlayerEconomySummary(auth.user!.id);

      return res.json({
        success: true,
        data: { summary }
      });
    } catch (error) {
      return next(error);
    }
  };

  xpHistory: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const history = await this.service.fetchXpLedger(auth.user!.id, req.query as unknown as RewardHistoryInput);

      return res.json({
        success: true,
        data: { history }
      });
    } catch (error) {
      return next(error);
    }
  };

  coinHistory: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const history = await this.service.fetchCoinLedger(auth.user!.id, req.query as unknown as RewardHistoryInput);

      return res.json({
        success: true,
        data: { history }
      });
    } catch (error) {
      return next(error);
    }
  };

  economyContext: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const economy = await this.service.fetchEconomyContext(auth.user!.id);

      return res.json({
        success: true,
        data: { economy }
      });
    } catch (error) {
      return next(error);
    }
  };

  exportLedger: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const file = await this.service.dumpEconomyLedger(auth.user!.id);

      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
      return res.status(200).send(file.content);
    } catch (error) {
      return next(error);
    }
  };
}
