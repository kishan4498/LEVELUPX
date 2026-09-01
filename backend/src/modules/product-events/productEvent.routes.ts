import { Role } from "@prisma/client";
import { Router } from "express";

import { requireVerifiedAdminSession } from "../../common/middlewares/adminSecurityMiddleware.js";
import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { requireRole } from "../../common/middlewares/roleMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { ProductEventController } from "./productEvent.controller.js";
import { PrismaProductEventRepository } from "./productEvent.repository.js";
import { ProductEventService } from "./productEvent.service.js";
import { createProductEventSchema } from "./productEvent.validation.js";

const repo = new PrismaProductEventRepository();
const service = new ProductEventService(repo);
const controller = new ProductEventController(service);

export const productEventRouter = Router();

productEventRouter.use(authMiddleware);
productEventRouter.post("/", validateRequest({ body: createProductEventSchema }), controller.record);
productEventRouter.get(
  "/funnel",
  requireRole(Role.ADMIN, Role.SUPER_ADMIN),
  requireVerifiedAdminSession,
  controller.funnel
);
