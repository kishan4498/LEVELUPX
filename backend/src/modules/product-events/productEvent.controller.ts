import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { ProductEventService } from "./productEvent.service.js";

export class ProductEventController {
  constructor(private readonly service: ProductEventService) {}

  record: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.service.record(auth.user!.id, req.body);
      return res.status(202).json({ success: true, data: { accepted: true } });
    } catch (error) {
      return next(error);
    }
  };

  funnel: RequestHandler = async (_req, res, next) => {
    try {
      const funnel = await this.service.funnel();
      return res.json({ success: true, data: { funnel } });
    } catch (error) {
      return next(error);
    }
  };
}
