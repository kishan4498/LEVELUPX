import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { GuildService } from "./guild.service.js";

export class GuildController {
  constructor(private readonly service: GuildService) {}

  create: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const guild = await this.service.create(auth.user!.id, req.body);

      return res.status(201).json({
        success: true,
        data: { guild }
      });
    } catch (error) {
      return next(error);
    }
  };

  list: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const guilds = await this.service.list(auth.user!.id);

      return res.json({
        success: true,
        data: { guilds }
      });
    } catch (error) {
      return next(error);
    }
  };

  getById: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const guild = await this.service.getById(auth.user!.id, req.params.id as string);

      return res.json({
        success: true,
        data: { guild }
      });
    } catch (error) {
      return next(error);
    }
  };

  join: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const guild = await this.service.join(auth.user!.id, req.params.id as string, req.body);

      return res.json({
        success: true,
        data: { guild }
      });
    } catch (error) {
      return next(error);
    }
  };

  rollInviteCode: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const inviteCode = await this.service.rollInviteCode(auth.user!.id, req.params.id as string);

      return res.json({
        success: true,
        data: { inviteCode }
      });
    } catch (error) {
      return next(error);
    }
  };

  leave: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.service.leave(auth.user!.id, req.params.id as string);

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };

  launchTeamQuest: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const teamQuest = await this.service.launchTeamQuest(auth.user!.id, req.params.id as string, req.body);

      return res.status(201).json({
        success: true,
        data: { teamQuest }
      });
    } catch (error) {
      return next(error);
    }
  };

  listTeamQuests: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const teamQuests = await this.service.listTeamQuests(auth.user!.id, req.params.id as string);

      return res.json({
        success: true,
        data: { teamQuests }
      });
    } catch (error) {
      return next(error);
    }
  };

  logTeamQuestProgress: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const teamQuest = await this.service.logTeamQuestProgress(
        auth.user!.id,
        req.params.id as string,
        req.params.teamQuestId as string,
        req.body
      );

      return res.json({
        success: true,
        data: { teamQuest }
      });
    } catch (error) {
      return next(error);
    }
  };
}
