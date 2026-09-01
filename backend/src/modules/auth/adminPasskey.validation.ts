import { z } from "zod";

const webAuthnResponseSchema = z.record(z.string(), z.unknown());

export const verifyAdminPasskeyRegistrationSchema = z.object({
  label: z.string().trim().min(2).max(80),
  response: webAuthnResponseSchema
});

export const verifyAdminPasskeyAuthenticationSchema = z.object({
  response: webAuthnResponseSchema
});

export const adminPasskeyParamsSchema = z.object({
  id: z.string().uuid()
});
