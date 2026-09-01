ALTER TABLE "User"
ADD COLUMN "twoStepEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoStepCodeHash" TEXT,
ADD COLUMN "twoStepExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
