import { AbuseSeverity } from "@prisma/client";
import { z } from "zod";

export const createAbuseReportSchema = z.object({
  reason: z.string().trim().min(10).max(500),
  severity: z.nativeEnum(AbuseSeverity).optional(),
  metadata: z.record(z.unknown()).optional()
});

