-- Store browser push subscriptions for future provider-backed delivery.
CREATE TABLE "UserPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPushSubscription_endpoint_key" ON "UserPushSubscription"("endpoint");
CREATE INDEX "UserPushSubscription_userId_updatedAt_idx" ON "UserPushSubscription"("userId", "updatedAt");

ALTER TABLE "UserPushSubscription" ADD CONSTRAINT "UserPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
