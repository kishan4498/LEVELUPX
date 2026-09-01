import type { Project } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import type { IProjectRepository, ProjectWithCount } from "./project.repository.js";
import type { CreateProjectInput, ProjectDto, UpdateProjectInput } from "./project.types.js";

export class ProjectService {
  constructor(private readonly repo: IProjectRepository) {}

  async create(userId: string, projectDraft: CreateProjectInput): Promise<ProjectDto> {
    const project = await this.repo.create(userId, projectDraft);
    return this.toDto({ ...project, activeQuestCount: 0 });
  }

  async list(userId: string): Promise<ProjectDto[]> {
    return (await this.repo.findForUser(userId)).map((project) => this.toDto(project));
  }

  async update(userId: string, projectId: string, patch: UpdateProjectInput): Promise<ProjectDto> {
    const project = await this.repo.updateOwned(userId, projectId, patch);

    if (!project) {
      throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
    }

    return this.toDto({ ...project, activeQuestCount: 0 });
  }

  async archive(userId: string, projectId: string) {
    const project = await this.repo.archiveOwned(userId, projectId);

    if (!project) {
      throw new AppError("Project not found", 404, "PROJECT_NOT_FOUND");
    }
  }

  private toDto(project: Project | ProjectWithCount): ProjectDto {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      color: project.color,
      archivedAt: project.archivedAt?.toISOString() ?? null,
      activeQuestCount: "activeQuestCount" in project ? project.activeQuestCount : 0,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString()
    };
  }
}
