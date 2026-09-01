-- Add lightweight user feedback fields to generated insights.
ALTER TABLE "AiInsight" ADD COLUMN "feedbackValue" TEXT;
ALTER TABLE "AiInsight" ADD COLUMN "feedbackComment" TEXT;
ALTER TABLE "AiInsight" ADD COLUMN "feedbackAt" TIMESTAMP(3);

CREATE INDEX "AiInsight_userId_generatedAt_idx" ON "AiInsight"("userId", "generatedAt");
CREATE INDEX "AiInsight_feedbackValue_feedbackAt_idx" ON "AiInsight"("feedbackValue", "feedbackAt");
