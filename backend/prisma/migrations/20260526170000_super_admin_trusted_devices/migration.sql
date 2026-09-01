CREATE TABLE "SuperAdminTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "deviceKeyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminTrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminLoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "codeAHash" TEXT NOT NULL,
    "codeBHash" TEXT NOT NULL,
    "codeCHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuperAdminTrustedDevice_userId_label_key" ON "SuperAdminTrustedDevice"("userId", "label");
CREATE INDEX "SuperAdminTrustedDevice_userId_active_idx" ON "SuperAdminTrustedDevice"("userId", "active");
CREATE INDEX "SuperAdminLoginChallenge_userId_deviceId_expiresAt_idx" ON "SuperAdminLoginChallenge"("userId", "deviceId", "expiresAt");
CREATE INDEX "SuperAdminLoginChallenge_usedAt_idx" ON "SuperAdminLoginChallenge"("usedAt");

ALTER TABLE "SuperAdminTrustedDevice" ADD CONSTRAINT "SuperAdminTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperAdminLoginChallenge" ADD CONSTRAINT "SuperAdminLoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperAdminLoginChallenge" ADD CONSTRAINT "SuperAdminLoginChallenge_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SuperAdminTrustedDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
