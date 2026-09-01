import { Difficulty, QuestPriority, QuestStatus, RecurrenceType } from "@prisma/client";
import { z } from "zod";

export const createQuestSchema = z.object({
  clientRequestId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(500).optional(),
  difficulty: z.nativeEnum(Difficulty),
  category: z.string().trim().min(2).max(60),
  estimatedMinutes: z.number().int().min(5).max(480),
  dueDate: z.string().datetime().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  parentQuestId: z.string().uuid().nullable().optional(),
  priority: z.nativeEnum(QuestPriority).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  recurrence: z.nativeEnum(RecurrenceType).optional(),
  reminderAt: z.string().datetime().nullable().optional()
});

export const updateQuestSchema = createQuestSchema.partial().refine((patch) => Object.keys(patch).length > 0, {
  message: "At least one quest field must be provided"
});

export const questIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const listQuestsQuerySchema = z.object({
  status: z.nativeEnum(QuestStatus).optional(),
  difficulty: z.nativeEnum(Difficulty).optional(),
  projectId: z.string().uuid().optional(),
  priority: z.nativeEnum(QuestPriority).optional(),
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(24).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
