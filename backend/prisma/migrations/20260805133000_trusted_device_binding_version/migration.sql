ALTER TABLE "SuperAdminTrustedDevice"
ADD COLUMN "bindingVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SuperAdminTrustedDevice"
ADD CONSTRAINT "SuperAdminTrustedDevice_bindingVersion_check"
CHECK ("bindingVersion" >= 1);
