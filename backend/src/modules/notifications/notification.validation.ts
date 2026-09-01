import { z } from "zod";

export const notificationIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const updateNotificationPreferencesSchema = z
  .object({
    inAppEnabled: z.boolean().optional(),
    rewardNotifications: z.boolean().optional(),
    achievementNotifications: z.boolean().optional(),
    insightNotifications: z.boolean().optional(),
    guildNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    questReminders: z.boolean().optional(),
    dailyDigest: z.boolean().optional(),
    quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional()
  })
  .refine((prefs) => Object.keys(prefs).length > 0, {
    message: "At least one notification preference must be provided"
  })
  .refine(
    (prefs) =>
      (prefs.quietHoursStart === undefined && prefs.quietHoursEnd === undefined) ||
      (prefs.quietHoursStart === null && prefs.quietHoursEnd === null) ||
      (typeof prefs.quietHoursStart === "string" && typeof prefs.quietHoursEnd === "string"),
    {
      message: "Quiet hours start and end must be provided together",
      path: ["quietHoursEnd"]
    }
  );

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256)
  })
});

export const removePushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048)
});
