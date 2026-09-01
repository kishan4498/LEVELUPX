import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { AiInsightController } from "./aiInsight.controller.js";
import { createAiInsightProviderFromEnv } from "./aiInsight.provider.js";
import { PrismaAiInsightRepository } from "./aiInsight.repository.js";
import { AiInsightService } from "./aiInsight.service.js";
import { aiInsightIdParamsSchema, insightFeedbackSchema } from "./aiInsight.validation.js";

const repo = new PrismaAiInsightRepository();
const service = new AiInsightService(repo, createAiInsightProviderFromEnv());
const controller = new AiInsightController(service);

export const aiInsightRouter = Router();

aiInsightRouter.use(authMiddleware);

aiInsightRouter.get("/", controller.list);
aiInsightRouter.get("/schedule", controller.schedule);
aiInsightRouter.get("/study-plan", controller.studyPlan);
aiInsightRouter.get("/scheduling-training", controller.schedulingTraining);
aiInsightRouter.get("/prompt-registry", controller.promptRegistry);
aiInsightRouter.get("/prompt-runs", controller.promptRuns);
aiInsightRouter.get("/learning", controller.learning);
aiInsightRouter.post("/generate", controller.generate);
aiInsightRouter.patch(
  "/:id/feedback",
  validateRequest({ params: aiInsightIdParamsSchema, body: insightFeedbackSchema }),
  controller.feedback
);
