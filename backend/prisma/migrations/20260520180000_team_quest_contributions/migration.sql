CREATE TABLE "TeamQuestContribution" (
    "id" TEXT NOT NULL,
    "teamQuestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamQuestContribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamQuestContribution_teamQuestId_userId_key" ON "TeamQuestContribution"("teamQuestId", "userId");

CREATE INDEX "TeamQuestContribution_userId_idx" ON "TeamQuestContribution"("userId");

ALTER TABLE "TeamQuestContribution" ADD CONSTRAINT "TeamQuestContribution_teamQuestId_fkey" FOREIGN KEY ("teamQuestId") REFERENCES "TeamQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamQuestContribution" ADD CONSTRAINT "TeamQuestContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
