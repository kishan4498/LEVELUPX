ALTER TABLE "User"
ADD COLUMN "adminWebAuthnUserId" TEXT;

CREATE UNIQUE INDEX "User_adminWebAuthnUserId_key"
ON "User"("adminWebAuthnUserId");

CREATE TABLE "AdminPasskey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "webAuthnUserId" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL,
  "backedUp" BOOLEAN NOT NULL,
  "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminPasskey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminWebAuthnChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminWebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminPasskey_credentialId_key"
ON "AdminPasskey"("credentialId");

CREATE INDEX "AdminPasskey_userId_active_idx"
ON "AdminPasskey"("userId", "active");

CREATE INDEX "AdminWebAuthnChallenge_userId_type_expiresAt_usedAt_idx"
ON "AdminWebAuthnChallenge"("userId", "type", "expiresAt", "usedAt");

ALTER TABLE "AdminPasskey"
ADD CONSTRAINT "AdminPasskey_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminWebAuthnChallenge"
ADD CONSTRAINT "AdminWebAuthnChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
