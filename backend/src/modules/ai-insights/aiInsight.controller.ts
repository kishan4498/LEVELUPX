import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AiInsightService } from "./aiInsight.service.js";

export class AiInsightController {
  constructor(private readonly service: AiInsightService) {}

  list: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const insights = await this.service.fetchUserInsights(auth.user!.id);

      return res.json({
        success: true,
        data: { insights }
      });
    } catch (error) {
      return next(error);
    }
  };

  promptRuns: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const promptRuns = await this.service.fetchPromptRunHistory(auth.user!.id);

      return res.json({
        success: true,
        data: { promptRuns }
      });
    } catch (error) {
      return next(error);
    }
  };

  generate: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const generated = await this.service.produceInsights(auth.user!.id);

      return res.status(201).json({
        success: true,
        data: { insights: generated.insights, meta: generated.meta }
      });
    } catch (error) {
      return next(error);
    }
  };

  schedule: RequestHandler = async (_req, res, next) => {
    try {
      const schedule = this.service.scheduleStatus();

      return res.json({
        success: true,
        data: { schedule }
      });
    } catch (error) {
      return next(error);
    }
  };

  studyPlan: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const studyPlan = await this.service.draftStudySchedule(auth.user!.id);

      return res.json({
        success: true,
        data: { studyPlan }
      });
    } catch (error) {
      return next(error);
    }
  };

  schedulingTraining: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const training = await this.service.compileTrainingDataset(auth.user!.id);

      return res.json({
        success: true,
        data: { training }
      });
    } catch (error) {
      return next(error);
    }
  };

  promptRegistry: RequestHandler = async (_req, res, next) => {
    try {
      const promptRegistry = this.service.registryStatus();

      return res.json({
        success: true,
        data: { promptRegistry }
      });
    } catch (error) {
      return next(error);
    }
  };

  learning: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const learning = await this.service.compileLearningSummary(auth.user!.id);

      return res.json({
        success: true,
        data: { learning }
      });
    } catch (error) {
      return next(error);
    }
  };

  feedback: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const insight = await this.service.submitFeedback(auth.user!.id, req.params.id as string, req.body);

      return res.json({
        success: true,
        data: { insight }
      });
    } catch (error) {
      return next(error);
    }
  };
}
