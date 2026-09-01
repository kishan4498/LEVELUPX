ALTER TABLE "Quest"
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Quest_clientRequestId_key"
ON "Quest"("clientRequestId");
