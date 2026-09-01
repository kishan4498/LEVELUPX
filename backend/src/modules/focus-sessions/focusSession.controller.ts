import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { FocusSessionService } from "./focusSession.service.js";
import type { HistoryInput } from "./focusSession.types.js";

export class FocusSessionController {
  constructor(private readonly service: FocusSessionService) {}

  start: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const session = await this.service.start(auth.user!.id, req.body);

      return res.status(201).json({
        success: true,
        data: { session }
      });
    } catch (error) {
      return next(error);
    }
  };

  stop: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const session = await this.service.stop(auth.user!.id, String(req.params.id), req.body);

      return res.json({
        success: true,
        data: { session }
      });
    } catch (error) {
      return next(error);
    }
  };

  pause: RequestHandler = async (req, res, next) => {
    try {
      const session = await this.service.pause((req as AuthRequest).user!.id, String(req.params.id));
      return res.json({ success: true, data: { session } });
    } catch (error) {
      return next(error);
    }
  };

  resume: RequestHandler = async (req, res, next) => {
    try {
      const session = await this.service.resume((req as AuthRequest).user!.id, String(req.params.id));
      return res.json({ success: true, data: { session } });
    } catch (error) {
      return next(error);
    }
  };

  updateNote: RequestHandler = async (req, res, next) => {
    try {
      const session = await this.service.updateNote(
        (req as AuthRequest).user!.id,
        String(req.params.id),
        req.body
      );
      return res.json({ success: true, data: { session } });
    } catch (error) {
      return next(error);
    }
  };

  history: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const sessions = await this.service.history(auth.user!.id, req.query as unknown as HistoryInput);

      return res.json({
        success: true,
        data: { sessions }
      });
    } catch (error) {
      return next(error);
    }
  };

  stats: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const stats = await this.service.stats(auth.user!.id);

      return res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      return next(error);
    }
  };
}
