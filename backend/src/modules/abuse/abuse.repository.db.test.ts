import { AbuseReportStatus, AbuseSeverity, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../prisma/client.js";
import { disconnectTestDatabase, isTestDatabaseConfigured, resetTestDatabase } from "../../test/testDatabase.js";
import { PrismaAdminRepository } from "../admin/admin.repository.js";
import { PrismaAbuseRepository } from "./abuse.repository.js";
import { AUTOMATIC_ABUSE_RULE_KEYS } from "./abuse.types.js";

const describeDb = isTestDatabaseConfigured() ? describe : describe.skip;

describeDb("PrismaAbuseRepository automatic signal deduplication", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it("creates one OPEN signal when the same rule races concurrently", async () => {
    const user = await createUser("abuse-race@example.com");
    const repo = new PrismaAbuseRepository();
    const signal = {
      userId: user.id,
      dedupeKey: AUTOMATIC_ABUSE_RULE_KEYS.rapidQuestCompletions,
      reason: "Too many quests completed in a short time",
      severity: AbuseSeverity.HIGH
    };

    const outcomes = await Promise.all([
      repo.createAutomaticOpen(signal),
      repo.createAutomaticOpen(signal)
    ]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    await expect(
      prisma.abuseReport.count({
        where: {
          userId: user.id,
          dedupeKey: signal.dedupeKey,
          status: AbuseReportStatus.OPEN
        }
      })
    ).resolves.toBe(1);
  });

  it("allows repeated manual NULL-key reports", async () => {
    const user = await createUser("manual-abuse@example.com");
    const repo = new PrismaAbuseRepository();
    const report = {
      userId: user.id,
      reason: "Manual report with repeated wording",
      severity: AbuseSeverity.LOW
    };

    await Promise.all([repo.create(report), repo.create(report)]);

    await expect(
      prisma.abuseReport.count({ where: { userId: user.id, dedupeKey: null } })
    ).resolves.toBe(2);
  });

  it("releases the rule after resolution and rejects reopening into a newer OPEN signal", async () => {
    const [user, admin] = await Promise.all([
      createUser("abuse-lifecycle@example.com"),
      createUser("abuse-admin@example.com", Role.ADMIN)
    ]);
    const abuseRepo = new PrismaAbuseRepository();
    const adminRepo = new PrismaAdminRepository();
    const signal = {
      userId: user.id,
      dedupeKey: AUTOMATIC_ABUSE_RULE_KEYS.repeatedQuestTitle,
      reason: "Repeated identical quest completions detected",
      severity: AbuseSeverity.MEDIUM
    };
    const first = await abuseRepo.createAutomaticOpen(signal);

    if (!first) {
      throw new Error("Expected the initial automatic report to be created");
    }

    await adminRepo.updateAbuseReport({
      adminUserId: admin.id,
      reportId: first.id,
      status: AbuseReportStatus.REVIEWED
    });
    const next = await abuseRepo.createAutomaticOpen(signal);

    expect(next).not.toBeNull();
    await expect(
      adminRepo.updateAbuseReport({
        adminUserId: admin.id,
        reportId: first.id,
        status: AbuseReportStatus.OPEN
      })
    ).rejects.toMatchObject({
      code: "ABUSE_SIGNAL_ALREADY_OPEN",
      statusCode: 409
    });
    await expect(
      prisma.adminAction.count({
        where: {
          adminUserId: admin.id,
          action: "ABUSE_REPORT_STATUS_UPDATED",
          targetId: first.id
        }
      })
    ).resolves.toBe(1);
  });
});

function createUser(email: string, role: Role = Role.USER) {
  return prisma.user.create({
    data: {
      name: "Abuse Dedup Tester",
      email,
      passwordHash: "password-hash",
      role,
      twoStepEnabled: role !== Role.USER,
      emailVerifiedAt: new Date()
    }
  });
}
