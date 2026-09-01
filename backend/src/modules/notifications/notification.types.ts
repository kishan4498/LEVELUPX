export type NotificationCategory =
  | "GENERAL"
  | "REWARD"
  | "ACHIEVEMENT"
  | "INSIGHT"
  | "GUILD"
  | "QUEST_REMINDER"
  | "DAILY_DIGEST";

export type NotificationDto = {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferenceDto = {
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

export type NotificationUnreadCountDto = {
  unreadCount: number;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushSubscriptionRemovalInput = {
  endpoint: string;
};

export type PushSubscriptionDto = {
  id: string;
  endpoint: string;
  userAgent: string | null;
  failureCount: number;
  lastFailureAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateNotificationPreferencesInput = Partial<
  Pick<
    NotificationPreferenceDto,
    | "inAppEnabled"
    | "rewardNotifications"
    | "achievementNotifications"
    | "insightNotifications"
    | "guildNotifications"
    | "pushNotifications"
    | "questReminders"
    | "dailyDigest"
    | "quietHoursStart"
    | "quietHoursEnd"
  >
>;

export type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  category?: NotificationCategory;
};
