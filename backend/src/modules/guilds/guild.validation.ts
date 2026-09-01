import { z } from "zod";
import { GuildVisibility } from "@prisma/client";

import { isAtMostOneWeek } from "./teamQuestRecurrence.js";

export const createGuildSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).optional(),
  visibility: z.nativeEnum(GuildVisibility).optional()
});

export const joinGuildSchema = z.object({
  inviteCode: z.string().trim().min(12).max(128).optional()
});

export const guildIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const teamQuestIdParamsSchema = z.object({
  id: z.string().uuid(),
  teamQuestId: z.string().uuid()
});

export const launchTeamQuestSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    targetType: z.string().trim().min(3).max(60),
    targetValue: z.number().int().min(1).max(100000),
    rewardXp: z.number().int().min(0).max(100000),
    rewardCoins: z.number().int().min(0).max(100000),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    repeatWeekly: z.boolean().optional().default(false)
  })
  .refine((dates) => new Date(dates.endDate).getTime() > new Date(dates.startDate).getTime(), {
    message: "Team quest end date must be after start date",
    path: ["endDate"]
  })
  .refine(
    (dates) => !dates.repeatWeekly || isAtMostOneWeek(new Date(dates.startDate), new Date(dates.endDate)),
    {
      message: "A repeating team quest cannot span more than one week",
      path: ["endDate"]
    }
  );

export const logTeamQuestProgressSchema = z.object({
  progressDelta: z.number().int().min(1).max(100000)
});
