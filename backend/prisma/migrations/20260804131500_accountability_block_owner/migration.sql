ALTER TABLE "AccountabilityConnection"
ADD COLUMN "blockedByUserId" TEXT;

ALTER TABLE "AccountabilityConnection"
ADD CONSTRAINT "AccountabilityConnection_blockedByUserId_fkey"
FOREIGN KEY ("blockedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AccountabilityConnection_blockedByUserId_idx"
ON "AccountabilityConnection"("blockedByUserId");
