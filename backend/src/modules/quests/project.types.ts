export type ProjectDto = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archivedAt: string | null;
  activeQuestCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  color?: string;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;
