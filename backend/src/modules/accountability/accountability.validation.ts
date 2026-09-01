import { z } from "zod";

export const accountabilityConnectionParamsSchema = z.object({
  id: z.string().uuid()
});

export const createAccountabilityRequestSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase())
});

export const respondToAccountabilityRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"])
});
