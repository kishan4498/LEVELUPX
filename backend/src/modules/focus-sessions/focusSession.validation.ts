import { SessionType } from "@prisma/client";
import { z } from "zod";

export const startFocusSessionSchema = z.object({
  questId: z.string().uuid().optional(),
  sessionType: z.nativeEnum(SessionType),
  targetMinutes: z.number().int().min(5).max(240).optional(),
  goal: z.string().trim().min(2).max(160).optional()
});

export const stopFocusSessionSchema = z.object({
  completed: z.boolean().optional(),
  distractionNote: z.string().trim().max(500).optional()
});

export const updateFocusNoteSchema = z.object({
  distractionNote: z.string().trim().max(500)
});

export const focusSessionIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const focusSessionHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});
