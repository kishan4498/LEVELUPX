import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { guildLeaderboardRoute } from "../leaderboard/leaderboard.routes.js";
import { GuildController } from "./guild.controller.js";
import { PrismaGuildRepository } from "./guild.repository.js";
import { GuildService } from "./guild.service.js";
import {
  createGuildSchema,
  launchTeamQuestSchema,
  guildIdParamsSchema,
  joinGuildSchema,
  teamQuestIdParamsSchema,
  logTeamQuestProgressSchema
} from "./guild.validation.js";

const repo = new PrismaGuildRepository();
const service = new GuildService(repo);
const controller = new GuildController(service);

export const guildRouter = Router();

guildRouter.use(authMiddleware);

guildRouter.post("/", validateRequest({ body: createGuildSchema }), controller.create);
guildRouter.get("/", controller.list);
guildRouter.post(
  "/:id/team-quests",
  validateRequest({ params: guildIdParamsSchema, body: launchTeamQuestSchema }),
  controller.launchTeamQuest
);
guildRouter.get("/:id/team-quests", validateRequest({ params: guildIdParamsSchema }), controller.listTeamQuests);
guildRouter.patch(
  "/:id/team-quests/:teamQuestId/progress",
  validateRequest({ params: teamQuestIdParamsSchema, body: logTeamQuestProgressSchema }),
  controller.logTeamQuestProgress
);
guildRouter.get("/:id/leaderboard", ...guildLeaderboardRoute);
guildRouter.post("/:id/invite-code", validateRequest({ params: guildIdParamsSchema }), controller.rollInviteCode);
guildRouter.get("/:id", validateRequest({ params: guildIdParamsSchema }), controller.getById);
guildRouter.post(
  "/:id/join",
  validateRequest({ params: guildIdParamsSchema, body: joinGuildSchema }),
  controller.join
);
guildRouter.post("/:id/leave", validateRequest({ params: guildIdParamsSchema }), controller.leave);
