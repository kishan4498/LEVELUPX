import { QuestStatus, type Project } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type ProjectWithCount = Project & {
  activeQuestCount: number;
};

export interface IProjectRepository {
  create(userId: string, projectDraft: { name: string; description?: string; color?: string }): Promise<Project>;
  findForUser(userId: string): Promise<ProjectWithCount[]>;
  findOwned(userId: string, projectId: string): Promise<Project | null>;
  updateOwned(userId: string, projectId: string, patch: { name?: string; description?: string; color?: string }): Promise<Project | null>;
  archiveOwned(userId: string, projectId: string): Promise<Project | null>;
}

export class PrismaProjectRepository implements IProjectRepository {
  create(userId: string, projectDraft: { name: string; description?: string; color?: string }) {
    return prisma.project.create({
      data: { userId, ...projectDraft }
    });
  }

  async findForUser(userId: string): Promise<ProjectWithCount[]> {
    const projects = await prisma.project.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            quests: {
              where: {
                status: { in: [QuestStatus.PENDING, QuestStatus.IN_PROGRESS] }
              }
            }
          }
        }
      },
      orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }]
    });

    return projects.map(({ _count, ...project }) => ({
      ...project,
      activeQuestCount: _count.quests
    }));
  }

  findOwned(userId: string, projectId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, userId }
    });
  }

  async updateOwned(userId: string, projectId: string, patch: { name?: string; description?: string; color?: string }) {
    const updated = await prisma.project.updateMany({
      where: { id: projectId, userId, archivedAt: null },
      data: patch
    });

    return updated.count === 1 ? this.findOwned(userId, projectId) : null;
  }

  async archiveOwned(userId: string, projectId: string) {
    const updated = await prisma.project.updateMany({
      where: { id: projectId, userId, archivedAt: null },
      data: { archivedAt: new Date() }
    });

    return updated.count === 1 ? this.findOwned(userId, projectId) : null;
  }
}
