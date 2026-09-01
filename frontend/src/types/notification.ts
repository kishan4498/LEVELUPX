export type AppNotification = {
  id: string;
  title: string;
  message: string;
  category:
    | "GENERAL"
    | "REWARD"
    | "ACHIEVEMENT"
    | "INSIGHT"
    | "GUILD"
    | "QUEST_REMINDER"
    | "DAILY_DIGEST";
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferences = {
  inAppEnabled: boolean;
  rewardNotifications: boolean;
  achievementNotifications: boolean;
  insightNotifications: boolean;
  guildNotifications: boolean;
  pushNotifications: boolean;
  questReminders: boolean;
  dailyDigest: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: string;
};

export type PushSubscriptionStatus = {
  id: string;
  endpoint: string;
  userAgent: string | null;
  failureCount: number;
  lastFailureAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};
