import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { AccountController } from "./account.controller.js";
import { PrismaAccountRepository } from "./account.repository.js";
import { AccountService } from "./account.service.js";
import { deleteAccountSchema } from "./account.validation.js";

const repo = new PrismaAccountRepository();
const service = new AccountService(repo);
const controller = new AccountController(service);

export const accountRouter = Router();

accountRouter.use(authMiddleware);
accountRouter.get("/export", controller.downloadData);
accountRouter.delete("/", validateRequest({ body: deleteAccountSchema }), controller.deleteAccount);
