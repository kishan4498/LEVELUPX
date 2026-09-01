-- Persist prompt generation run metadata separately from individual insight rows.
CREATE TABLE "AiPromptRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerSource" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptAudience" TEXT NOT NULL,
    "maxInsights" INTEGER NOT NULL,
    "usedFallback" BOOLEAN NOT NULL,
    "insightCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPromptRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiPromptRun_userId_createdAt_idx" ON "AiPromptRun"("userId", "createdAt");
CREATE INDEX "AiPromptRun_providerSource_createdAt_idx" ON "AiPromptRun"("providerSource", "createdAt");
CREATE INDEX "AiPromptRun_promptVersion_createdAt_idx" ON "AiPromptRun"("promptVersion", "createdAt");

ALTER TABLE "AiPromptRun" ADD CONSTRAINT "AiPromptRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
