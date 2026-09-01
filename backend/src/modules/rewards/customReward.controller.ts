import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { CustomRewardService } from "./customReward.service.js";

export class CustomRewardController {
  constructor(private readonly service: CustomRewardService) {}

  create: RequestHandler = async (req, res, next) => {
    try {
      const reward = await this.service.create((req as AuthRequest).user!.id, req.body);
      return res.status(201).json({ success: true, data: { reward } });
    } catch (error) {
      return next(error);
    }
  };

  list: RequestHandler = async (req, res, next) => {
    try {
      const rewards = await this.service.list((req as AuthRequest).user!.id);
      return res.json({ success: true, data: { rewards } });
    } catch (error) {
      return next(error);
    }
  };

  deactivate: RequestHandler = async (req, res, next) => {
    try {
      await this.service.deactivate((req as AuthRequest).user!.id, String(req.params.id));
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };

  redeem: RequestHandler = async (req, res, next) => {
    try {
      const redemption = await this.service.redeem((req as AuthRequest).user!.id, String(req.params.id));
      return res.json({ success: true, data: { redemption } });
    } catch (error) {
      return next(error);
    }
  };

  history: RequestHandler = async (req, res, next) => {
    try {
      const redemptions = await this.service.history((req as AuthRequest).user!.id);
      return res.json({ success: true, data: { redemptions } });
    } catch (error) {
      return next(error);
    }
  };
}
