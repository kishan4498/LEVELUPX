import { AbuseReportStatus, Role, UserStatus } from "@prisma/client";
import { z } from "zod";

export const adminUserIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus)
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(Role)
});

export const abuseReportIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const marketplaceListingIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const updateAbuseReportSchema = z.object({
  status: z.nativeEnum(AbuseReportStatus)
});

export const updateEconomySettingsSchema = z
  .object({
    xpMultiplier: z.number().min(0.1).max(10).optional(),
    coinMultiplier: z.number().min(0.1).max(10).optional(),
    dailyCoinLimit: z.number().int().min(0).max(100000).optional(),
    maxQuestReward: z.number().int().min(1).max(100000).optional(),
    inflationRate: z.number().min(0).max(100).optional()
  })
  .refine((settings) => Object.keys(settings).length > 0, {
    message: "At least one economy setting must be provided"
  });

export const analyticsExportQuerySchema = z.object({
  format: z.enum(["csv", "pdf"]).default("csv")
});

export const marketplaceTradeExportQuerySchema = analyticsExportQuerySchema;

export const adminReportIdParamsSchema = z.object({
  id: z.string().uuid()
});
