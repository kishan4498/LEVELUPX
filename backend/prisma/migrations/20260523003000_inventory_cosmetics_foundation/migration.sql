-- Add a lightweight cosmetic inventory foundation without purchases or shop flows yet.
CREATE TYPE "CosmeticSlot" AS ENUM ('AVATAR_FRAME', 'PROFILE_BADGE');
CREATE TYPE "CosmeticRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

CREATE TABLE "CosmeticItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "slot" "CosmeticSlot" NOT NULL,
    "rarity" "CosmeticRarity" NOT NULL,
    "unlockLevel" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CosmeticItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserCosmetic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cosmeticItemId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCosmetic_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserProfile" ADD COLUMN "selectedCosmeticId" TEXT;

CREATE UNIQUE INDEX "CosmeticItem_name_key" ON "CosmeticItem"("name");
CREATE UNIQUE INDEX "UserCosmetic_userId_cosmeticItemId_key" ON "UserCosmetic"("userId", "cosmeticItemId");
CREATE INDEX "UserCosmetic_userId_unlockedAt_idx" ON "UserCosmetic"("userId", "unlockedAt");

ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_cosmeticItemId_fkey" FOREIGN KEY ("cosmeticItemId") REFERENCES "CosmeticItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_selectedCosmeticId_fkey" FOREIGN KEY ("selectedCosmeticId") REFERENCES "CosmeticItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
