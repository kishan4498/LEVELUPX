import { z } from "zod";

const projectFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
};

export const createProjectSchema = z.object(projectFields);
export const updateProjectSchema = z
  .object(projectFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one project field must be provided"
  });

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid()
});
