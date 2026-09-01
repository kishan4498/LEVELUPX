ALTER TABLE "AbuseReport" ADD COLUMN "dedupeKey" TEXT;

-- Preserve the rule identity on historical closed signals.
UPDATE "AbuseReport"
SET "dedupeKey" = CASE
  WHEN "reason" = 'Too many quests completed in a short time'
    THEN 'QUEST_COMPLETION_RAPID_HOURLY'
  WHEN "reason" = 'Repeated identical quest completions detected'
    THEN 'QUEST_COMPLETION_REPEATED_TITLE_DAILY'
END
WHERE "status" <> 'OPEN'
  AND "reason" IN (
    'Too many quests completed in a short time',
    'Repeated identical quest completions detected'
  );

-- Existing deployments may already contain duplicate OPEN rule rows. Keep their
-- audit history intact and assign the active key to the newest row only.
WITH "canonicalOpenSignals" AS (
  SELECT DISTINCT ON ("userId", "reason")
    "id",
    "reason"
  FROM "AbuseReport"
  WHERE "status" = 'OPEN'
    AND "reason" IN (
      'Too many quests completed in a short time',
      'Repeated identical quest completions detected'
    )
  ORDER BY "userId", "reason", "createdAt" DESC, "id" DESC
)
UPDATE "AbuseReport" AS "report"
SET "dedupeKey" = CASE
  WHEN "signal"."reason" = 'Too many quests completed in a short time'
    THEN 'QUEST_COMPLETION_RAPID_HOURLY'
  WHEN "signal"."reason" = 'Repeated identical quest completions detected'
    THEN 'QUEST_COMPLETION_REPEATED_TITLE_DAILY'
END
FROM "canonicalOpenSignals" AS "signal"
WHERE "report"."id" = "signal"."id";

-- PostgreSQL partial uniqueness allows any number of manual NULL-key reports,
-- while enforcing one OPEN automatic signal per user and rule. Closed rows retain
-- their stable rule key for audit history and no longer participate in uniqueness.
CREATE UNIQUE INDEX "AbuseReport_open_rule_key_unique"
  ON "AbuseReport"("userId", "dedupeKey")
  WHERE "dedupeKey" IS NOT NULL AND "status" = 'OPEN';
