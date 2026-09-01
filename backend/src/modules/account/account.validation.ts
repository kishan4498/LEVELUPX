import { z } from "zod";

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  confirmation: z.literal("DELETE")
});
