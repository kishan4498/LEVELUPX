import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { QuestService } from "./quest.service.js";
import type { QuestListInput } from "./quest.types.js";

export class QuestController {
  constructor(private readonly service: QuestService) {}

  draftQuest: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const quest = await this.service.draftQuest(auth.user!.id, req.body);
      return res.status(201).json({ success: true, data: { quest } });
    } catch (error) {
      return next(error);
    }
  };

  list: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const quests = await this.service.browseQuests(auth.user!.id, req.query as unknown as QuestListInput);
      return res.json({ success: true, data: { quests } });
    } catch (error) {
      return next(error);
    }
  };

  getById: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const quest = await this.service.getById(auth.user!.id, req.params.id as string);
      return res.json({ success: true, data: { quest } });
    } catch (error) {
      return next(error);
    }
  };

  tweakQuest: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const quest = await this.service.tweakQuest(auth.user!.id, req.params.id as string, req.body);
      return res.json({ success: true, data: { quest } });
    } catch (error) {
      return next(error);
    }
  };

  retireQuest: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.service.retireQuest(auth.user!.id, req.params.id as string);

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };

  embarkOnQuest: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const quest = await this.service.embarkOnQuest(auth.user!.id, req.params.id as string);
      return res.json({ success: true, data: { quest } });
    } catch (error) {
      return next(error);
    }
  };

  turnInQuest: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const completion = await this.service.turnInQuest(auth.user!.id, req.params.id as string);
      return res.json({ success: true, data: completion });
    } catch (error) {
      return next(error);
    }
  };

  abandonQuest: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const quest = await this.service.abandonQuest(auth.user!.id, req.params.id as string);
      return res.json({ success: true, data: { quest } });
    } catch (error) {
      return next(error);
    }
  };
}
