import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { ProjectService } from "./project.service.js";

export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  create: RequestHandler = async (req, res, next) => {
    try {
      const project = await this.service.create((req as AuthRequest).user!.id, req.body);
      return res.status(201).json({ success: true, data: { project } });
    } catch (error) {
      return next(error);
    }
  };

  list: RequestHandler = async (req, res, next) => {
    try {
      const projects = await this.service.list((req as AuthRequest).user!.id);
      return res.json({ success: true, data: { projects } });
    } catch (error) {
      return next(error);
    }
  };

  update: RequestHandler = async (req, res, next) => {
    try {
      const project = await this.service.update((req as AuthRequest).user!.id, String(req.params.projectId), req.body);
      return res.json({ success: true, data: { project } });
    } catch (error) {
      return next(error);
    }
  };

  archive: RequestHandler = async (req, res, next) => {
    try {
      await this.service.archive((req as AuthRequest).user!.id, String(req.params.projectId));
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };
}
