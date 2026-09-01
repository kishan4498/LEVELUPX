CREATE TYPE "ProductivityMode" AS ENUM ('STUDENT', 'PROFESSIONAL', 'PERSONAL');
CREATE TYPE "QuestPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "RecurrenceType" AS ENUM ('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY');
CREATE TYPE "GuildVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');

ALTER TABLE "UserProfile"
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN "productivityMode" "ProductivityMode" NOT NULL DEFAULT 'PERSONAL',
ADD COLUMN "preferredFocusMinutes" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#4F8A70',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Quest"
ADD COLUMN "projectId" TEXT,
ADD COLUMN "parentQuestId" TEXT,
ADD COLUMN "recurrenceSourceId" TEXT,
ADD COLUMN "priority" "QuestPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "recurrence" "RecurrenceType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "reminderAt" TIMESTAMP(3);

ALTER TABLE "FocusSession"
ADD COLUMN "targetMinutes" INTEGER,
ADD COLUMN "goal" TEXT,
ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "distractionNote" TEXT;

ALTER TABLE "Guild"
ADD COLUMN "visibility" "GuildVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN "inviteCodeHash" TEXT;

ALTER TABLE "UserNotificationPreference"
ADD COLUMN "questReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "dailyDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "quietHoursStart" TEXT,
ADD COLUMN "quietHoursEnd" TEXT;

CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "costCoins" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomRewardRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "costCoins" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomRewardRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountabilityConnection" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountabilityConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "properties" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_userId_name_key" ON "Project"("userId", "name");
CREATE INDEX "Project_userId_archivedAt_idx" ON "Project"("userId", "archivedAt");
CREATE UNIQUE INDEX "Quest_recurrenceSourceId_key" ON "Quest"("recurrenceSourceId");
CREATE INDEX "Quest_userId_projectId_status_idx" ON "Quest"("userId", "projectId", "status");
CREATE INDEX "Quest_userId_priority_dueDate_idx" ON "Quest"("userId", "priority", "dueDate");
CREATE INDEX "Quest_userId_reminderAt_status_idx" ON "Quest"("userId", "reminderAt", "status");
CREATE INDEX "Quest_parentQuestId_idx" ON "Quest"("parentQuestId");
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx" ON "UserSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "CustomReward_userId_active_createdAt_idx" ON "CustomReward"("userId", "active", "createdAt");
CREATE INDEX "CustomRewardRedemption_userId_redeemedAt_idx" ON "CustomRewardRedemption"("userId", "redeemedAt");
CREATE UNIQUE INDEX "AccountabilityConnection_requesterId_recipientId_key" ON "AccountabilityConnection"("requesterId", "recipientId");
CREATE INDEX "AccountabilityConnection_recipientId_status_idx" ON "AccountabilityConnection"("recipientId", "status");
CREATE INDEX "ProductEvent_name_occurredAt_idx" ON "ProductEvent"("name", "occurredAt");
CREATE INDEX "ProductEvent_userId_occurredAt_idx" ON "ProductEvent"("userId", "occurredAt");

ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_parentQuestId_fkey" FOREIGN KEY ("parentQuestId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_recurrenceSourceId_fkey" FOREIGN KEY ("recurrenceSourceId") REFERENCES "Quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomReward" ADD CONSTRAINT "CustomReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomRewardRedemption" ADD CONSTRAINT "CustomRewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomRewardRedemption" ADD CONSTRAINT "CustomRewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "CustomReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountabilityConnection" ADD CONSTRAINT "AccountabilityConnection_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountabilityConnection" ADD CONSTRAINT "AccountabilityConnection_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
