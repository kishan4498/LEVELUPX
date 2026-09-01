import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AccountabilityService } from "./accountability.service.js";

export class AccountabilityController {
  constructor(private readonly service: AccountabilityService) {}

  list: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const connections = await this.service.list(auth.user!.id);
      return res.json({ success: true, data: { connections } });
    } catch (error) {
      return next(error);
    }
  };

  request: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const connection = await this.service.request(auth.user!.id, req.body);
      return res.status(201).json({ success: true, data: { connection } });
    } catch (error) {
      return next(error);
    }
  };

  respond: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const connection = await this.service.respond(auth.user!.id, String(req.params.id), req.body);
      return res.json({ success: true, data: { connection } });
    } catch (error) {
      return next(error);
    }
  };

  remove: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.service.remove(auth.user!.id, String(req.params.id));
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };

  block: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const connection = await this.service.block(auth.user!.id, String(req.params.id));
      return res.json({ success: true, data: { connection } });
    } catch (error) {
      return next(error);
    }
  };
}
