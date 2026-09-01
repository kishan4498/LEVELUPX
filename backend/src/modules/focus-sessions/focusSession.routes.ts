import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { PrismaAccountabilityRepository } from "../accountability/accountability.repository.js";
import { FocusSessionController } from "./focusSession.controller.js";
import { PrismaFocusSessionRepository } from "./focusSession.repository.js";
import { FocusSessionService } from "./focusSession.service.js";
import {
  focusSessionHistoryQuerySchema,
  focusSessionIdParamsSchema,
  startFocusSessionSchema,
  stopFocusSessionSchema,
  updateFocusNoteSchema
} from "./focusSession.validation.js";

const repo = new PrismaFocusSessionRepository();
const service = new FocusSessionService(repo, new PrismaAccountabilityRepository());
const controller = new FocusSessionController(service);

export const focusSessionRouter = Router();

focusSessionRouter.use(authMiddleware);

focusSessionRouter.post("/start", validateRequest({ body: startFocusSessionSchema }), controller.start);
focusSessionRouter.post(
  "/:id/stop",
  validateRequest({ params: focusSessionIdParamsSchema, body: stopFocusSessionSchema }),
  controller.stop
);
focusSessionRouter.post(
  "/:id/pause",
  validateRequest({ params: focusSessionIdParamsSchema }),
  controller.pause
);
focusSessionRouter.post(
  "/:id/resume",
  validateRequest({ params: focusSessionIdParamsSchema }),
  controller.resume
);
focusSessionRouter.patch(
  "/:id/note",
  validateRequest({ params: focusSessionIdParamsSchema, body: updateFocusNoteSchema }),
  controller.updateNote
);
focusSessionRouter.get("/history", validateRequest({ query: focusSessionHistoryQuerySchema }), controller.history);
focusSessionRouter.get("/stats", controller.stats);
