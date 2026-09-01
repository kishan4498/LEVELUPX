import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { RewardController } from "./reward.controller.js";
import { PrismaRewardRepository } from "./reward.repository.js";
import { RewardReadService } from "./reward.service.js";
import { rewardHistoryQuerySchema } from "./reward.validation.js";
import { CustomRewardController } from "./customReward.controller.js";
import { PrismaCustomRewardRepository } from "./customReward.repository.js";
import { CustomRewardService } from "./customReward.service.js";
import { createCustomRewardSchema, customRewardIdParamsSchema } from "./customReward.validation.js";

const repo = new PrismaRewardRepository();
const readService = new RewardReadService(repo);
const controller = new RewardController(readService);
const customRepo = new PrismaCustomRewardRepository();
const customService = new CustomRewardService(customRepo);
const customController = new CustomRewardController(customService);

export const rewardRouter = Router();

rewardRouter.use(authMiddleware);

rewardRouter.post("/custom", validateRequest({ body: createCustomRewardSchema }), customController.create);
rewardRouter.get("/custom", customController.list);
rewardRouter.get("/custom-redemptions", customController.history);
rewardRouter.post(
  "/custom/:id/redeem",
  validateRequest({ params: customRewardIdParamsSchema }),
  customController.redeem
);
rewardRouter.delete(
  "/custom/:id",
  validateRequest({ params: customRewardIdParamsSchema }),
  customController.deactivate
);
rewardRouter.get("/summary", controller.summary);
rewardRouter.get("/economy-context", controller.economyContext);
rewardRouter.get("/export", controller.exportLedger);
rewardRouter.get("/xp-history", validateRequest({ query: rewardHistoryQuerySchema }), controller.xpHistory);
rewardRouter.get("/coin-history", validateRequest({ query: rewardHistoryQuerySchema }), controller.coinHistory);
