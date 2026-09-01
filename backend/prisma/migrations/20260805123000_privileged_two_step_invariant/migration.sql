-- Privileged identities must never exist without the account-level two-step
-- policy, even when a role or security setting changes outside the HTTP API.
UPDATE "User"
SET "twoStepEnabled" = true
WHERE "role" IN ('ADMIN', 'SUPER_ADMIN')
  AND "twoStepEnabled" = false;

ALTER TABLE "User"
ADD CONSTRAINT "User_privileged_two_step_required"
CHECK ("role" = 'USER' OR "twoStepEnabled" = true);
