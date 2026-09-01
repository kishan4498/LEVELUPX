import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { abuseService } from "../abuse/abuse.routes.js";
import { achievementService } from "../achievements/achievement.routes.js";
import { notificationService } from "../notifications/notification.routes.js";
import { PrismaRewardRepository } from "../rewards/reward.repository.js";
import { QuestController } from "./quest.controller.js";
import { PrismaQuestRepository } from "./quest.repository.js";
import { QuestService } from "./quest.service.js";
import { createQuestSchema, listQuestsQuerySchema, questIdParamsSchema, updateQuestSchema } from "./quest.validation.js";
import { RewardService } from "../rewards/reward.service.js";
import { ProjectController } from "./project.controller.js";
import { PrismaProjectRepository } from "./project.repository.js";
import { ProjectService } from "./project.service.js";
import {
  createProjectSchema,
  projectIdParamsSchema,
  updateProjectSchema
} from "./project.validation.js";

const questRepo = new PrismaQuestRepository();
const rewardRepo = new PrismaRewardRepository();
const rewardService = new RewardService(rewardRepo);
const questService = new QuestService(
  questRepo,
  rewardService,
  achievementService,
  notificationService,
  abuseService
);
const questController = new QuestController(questService);
const projectRepo = new PrismaProjectRepository();
const projectService = new ProjectService(projectRepo);
const projectController = new ProjectController(projectService);

export const questRouter = Router();

questRouter.use(authMiddleware);

questRouter.post("/projects", validateRequest({ body: createProjectSchema }), projectController.create);
questRouter.get("/projects", projectController.list);
questRouter.patch(
  "/projects/:projectId",
  validateRequest({ params: projectIdParamsSchema, body: updateProjectSchema }),
  projectController.update
);
questRouter.delete(
  "/projects/:projectId",
  validateRequest({ params: projectIdParamsSchema }),
  projectController.archive
);
questRouter.post("/", validateRequest({ body: createQuestSchema }), questController.draftQuest);
questRouter.get("/", validateRequest({ query: listQuestsQuerySchema }), questController.list);
questRouter.post("/:id/start", validateRequest({ params: questIdParamsSchema }), questController.embarkOnQuest);
questRouter.post("/:id/complete", validateRequest({ params: questIdParamsSchema }), questController.turnInQuest);
questRouter.post("/:id/fail", validateRequest({ params: questIdParamsSchema }), questController.abandonQuest);
questRouter.get("/:id", validateRequest({ params: questIdParamsSchema }), questController.getById);
questRouter.patch("/:id", validateRequest({ params: questIdParamsSchema, body: updateQuestSchema }), questController.tweakQuest);
questRouter.delete("/:id", validateRequest({ params: questIdParamsSchema }), questController.retireQuest);
