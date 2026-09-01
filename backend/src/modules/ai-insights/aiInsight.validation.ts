import { z } from "zod";

export const aiInsightIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const insightFeedbackSchema = z.object({
  feedbackValue: z.enum(["HELPFUL", "NOT_HELPFUL"]),
  feedbackComment: z.string().trim().max(500).nullable().optional()
});
