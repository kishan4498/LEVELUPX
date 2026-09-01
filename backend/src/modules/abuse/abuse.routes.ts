import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { AbuseController } from "./abuse.controller.js";
import { PrismaAbuseRepository } from "./abuse.repository.js";
import { AbuseService } from "./abuse.service.js";
import { createAbuseReportSchema } from "./abuse.validation.js";

const repo = new PrismaAbuseRepository();
export const abuseService = new AbuseService(repo);
const controller = new AbuseController(abuseService);

export const abuseRouter = Router();

abuseRouter.use(authMiddleware);

abuseRouter.post("/", validateRequest({ body: createAbuseReportSchema }), controller.create);
abuseRouter.get("/me", controller.mine);
