import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(72)
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(72),
  twoStepCode: z.string().trim().regex(/^\d{6}$/).optional(),
  adminDeviceKey: z.string().trim().min(32).max(256).optional(),
  adminCodeA: z.string().trim().regex(/^\d{6}$/).optional(),
  adminCodeB: z.string().trim().regex(/^\d{6}$/).optional(),
  adminCodeC: z.string().trim().regex(/^\d{6}$/).optional(),
  superAdminCodeA: z.string().trim().regex(/^\d{6}$/).optional(),
  superAdminCodeB: z.string().trim().regex(/^\d{6}$/).optional(),
  superAdminCodeC: z.string().trim().regex(/^\d{6}$/).optional()
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase()
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  token: z.string().trim().min(16).max(128),
  newPassword: z.string().min(8).max(72)
});

export const requestEmailVerificationSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(72)
});

export const verifyEmailSchema = requestEmailVerificationSchema.extend({
  code: z.string().trim().regex(/^\d{8}$/)
});

export const twoStepPreferenceSchema = z.object({
  currentPassword: z.string().min(1).max(72)
});

export const sessionIdParamsSchema = z.object({
  id: z.string().uuid()
});
