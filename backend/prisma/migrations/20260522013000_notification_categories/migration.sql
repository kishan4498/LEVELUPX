-- Add lightweight categories so notification preferences can suppress known event classes.
ALTER TABLE "Notification" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL';

CREATE INDEX "Notification_userId_category_createdAt_idx" ON "Notification"("userId", "category", "createdAt");
