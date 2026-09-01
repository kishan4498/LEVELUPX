import { z } from "zod";

export const createCustomRewardSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
  costCoins: z.number().int().min(1).max(100000)
});

export const customRewardIdParamsSchema = z.object({
  id: z.string().uuid()
});
