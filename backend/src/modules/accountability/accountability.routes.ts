import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { createRateLimiter } from "../../common/middlewares/rateLimit.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { env } from "../../config/env.js";
import { notificationService } from "../notifications/notification.routes.js";
import { AccountabilityController } from "./accountability.controller.js";
import { PrismaAccountabilityRepository } from "./accountability.repository.js";
import { AccountabilityService } from "./accountability.service.js";
import {
  accountabilityConnectionParamsSchema,
  createAccountabilityRequestSchema,
  respondToAccountabilityRequestSchema
} from "./accountability.validation.js";

const repo = new PrismaAccountabilityRepository();
const service = new AccountabilityService(repo, notificationService);
const controller = new AccountabilityController(service);
const inviteLimiter = createRateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  maxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  message: "Too many accountability invitations"
});

export const accountabilityRouter = Router();

accountabilityRouter.use(authMiddleware);
accountabilityRouter.get("/", controller.list);
accountabilityRouter.post(
  "/",
  inviteLimiter,
  validateRequest({ body: createAccountabilityRequestSchema }),
  controller.request
);
accountabilityRouter.patch(
  "/:id/respond",
  validateRequest({ params: accountabilityConnectionParamsSchema, body: respondToAccountabilityRequestSchema }),
  controller.respond
);
accountabilityRouter.post(
  "/:id/block",
  validateRequest({ params: accountabilityConnectionParamsSchema }),
  controller.block
);
accountabilityRouter.delete(
  "/:id",
  validateRequest({ params: accountabilityConnectionParamsSchema }),
  controller.remove
);
