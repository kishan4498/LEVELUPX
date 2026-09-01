import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AbuseService } from "./abuse.service.js";

export class AbuseController {
  constructor(private readonly service: AbuseService) {}

  create: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const report = await this.service.fileManualAbuseReport(auth.user!.id, req.body);

      return res.status(201).json({
        success: true,
        data: { report }
      });
    } catch (error) {
      return next(error);
    }
  };

  mine: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const reports = await this.service.fetchMyAbuseReports(auth.user!.id);

      return res.json({
        success: true,
        data: { reports }
      });
    } catch (error) {
      return next(error);
    }
  };
}
