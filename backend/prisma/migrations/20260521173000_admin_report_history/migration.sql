CREATE TYPE "AdminReportFormat" AS ENUM ('CSV', 'PDF');

CREATE TABLE "AdminReport" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "format" "AdminReportFormat" NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminReport_adminUserId_createdAt_idx" ON "AdminReport"("adminUserId", "createdAt");

CREATE INDEX "AdminReport_reportType_createdAt_idx" ON "AdminReport"("reportType", "createdAt");

ALTER TABLE "AdminReport" ADD CONSTRAINT "AdminReport_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
