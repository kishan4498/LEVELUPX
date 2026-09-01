ALTER TABLE "Skill"
ADD COLUMN "prerequisiteSkillId" TEXT,
ADD COLUMN "prerequisiteLevel" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Skill"
ADD CONSTRAINT "Skill_prerequisiteLevel_check" CHECK ("prerequisiteLevel" >= 1);

CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");
CREATE INDEX "Skill_prerequisiteSkillId_idx" ON "Skill"("prerequisiteSkillId");

ALTER TABLE "Skill"
ADD CONSTRAINT "Skill_prerequisiteSkillId_fkey"
FOREIGN KEY ("prerequisiteSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Skill" AS target
SET "prerequisiteSkillId" = prerequisite."id", "prerequisiteLevel" = 1
FROM "Skill" AS prerequisite
WHERE target."name" = 'Deep Focus' AND prerequisite."name" = 'Quest Planning';

UPDATE "Skill" AS target
SET "prerequisiteSkillId" = prerequisite."id", "prerequisiteLevel" = 2
FROM "Skill" AS prerequisite
WHERE target."name" = 'Streak Discipline' AND prerequisite."name" = 'Quest Planning';

UPDATE "Skill" AS target
SET "prerequisiteSkillId" = prerequisite."id", "prerequisiteLevel" = 2
FROM "Skill" AS prerequisite
WHERE target."name" = 'Recovery Rhythm' AND prerequisite."name" = 'Deep Focus';

UPDATE "Skill" AS target
SET "prerequisiteSkillId" = prerequisite."id", "prerequisiteLevel" = 1
FROM "Skill" AS prerequisite
WHERE target."name" = 'Guild Support' AND prerequisite."name" = 'Streak Discipline';

ALTER TABLE "TeamQuest"
ADD COLUMN "repeatWeekly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurrenceSeriesId" TEXT,
ADD COLUMN "recurrenceWeekStart" TIMESTAMP(3),
ADD COLUMN "sourceTeamQuestId" TEXT;

CREATE UNIQUE INDEX "TeamQuest_recurrenceSeriesId_recurrenceWeekStart_key"
ON "TeamQuest"("recurrenceSeriesId", "recurrenceWeekStart");

CREATE INDEX "TeamQuest_repeatWeekly_status_endDate_idx"
ON "TeamQuest"("repeatWeekly", "status", "endDate");

CREATE INDEX "TeamQuest_sourceTeamQuestId_idx" ON "TeamQuest"("sourceTeamQuestId");

ALTER TABLE "TeamQuest"
ADD CONSTRAINT "TeamQuest_sourceTeamQuestId_fkey"
FOREIGN KEY ("sourceTeamQuestId") REFERENCES "TeamQuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
