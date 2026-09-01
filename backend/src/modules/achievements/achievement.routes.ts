import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { AchievementController } from "./achievement.controller.js";
import { PrismaAchievementRepository } from "./achievement.repository.js";
import { AchievementService } from "./achievement.service.js";

export const achievementRepository = new PrismaAchievementRepository();
export const achievementService = new AchievementService(achievementRepository);
const controller = new AchievementController(achievementService);

export const achievementRouter = Router();
export const userAchievementRouter = Router();

achievementRouter.get("/", controller.fetchCatalog);

userAchievementRouter.use(authMiddleware);
userAchievementRouter.get("/me/achievements", controller.listMine);
userAchievementRouter.get("/me/achievements/progress", controller.listProgress);
