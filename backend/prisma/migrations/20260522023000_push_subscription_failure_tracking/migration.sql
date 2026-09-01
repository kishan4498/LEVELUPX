-- Track push delivery failures so stale browser subscriptions can be ignored later.
ALTER TABLE "UserPushSubscription" ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserPushSubscription" ADD COLUMN "lastFailureAt" TIMESTAMP(3);
ALTER TABLE "UserPushSubscription" ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE INDEX "UserPushSubscription_disabledAt_lastFailureAt_idx" ON "UserPushSubscription"("disabledAt", "lastFailureAt");
