-- Prepare push notification preferences without enabling external push delivery yet.
ALTER TABLE "UserNotificationPreference" ADD COLUMN "pushNotifications" BOOLEAN NOT NULL DEFAULT false;
