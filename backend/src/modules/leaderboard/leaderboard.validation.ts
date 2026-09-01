import { LeaderboardPeriod } from "@prisma/client";
import { z } from "zod";

export const leaderboardQuerySchema = z.object({
  period: z.nativeEnum(LeaderboardPeriod).default(LeaderboardPeriod.WEEKLY),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const guildLeaderboardParamsSchema = z.object({
  id: z.string().uuid()
});

