import { AbuseReportStatus, AbuseSeverity, type AbuseReport } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { CreateAbuseReportData, IAbuseRepository } from "./abuse.repository.js";
import { AbuseService } from "./abuse.service.js";
import { AUTOMATIC_ABUSE_RULE_KEYS } from "./abuse.types.js";

function makeReport(seed: Partial<AbuseReport> & Pick<AbuseReport, "userId" | "reason" | "severity">): AbuseReport {
  return {
    id: `${seed.userId}-${seed.reason}`.toLowerCase().replaceAll(" ", "-"),
    status: AbuseReportStatus.OPEN,
    dedupeKey: seed.dedupeKey ?? null,
    metadata: seed.metadata ?? null,
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    ...seed
  };
}

function makeRepo(setup: {
  completionsLastHour?: number;
  repeatedTitleCompletionsToday?: number;
  openDedupeKeys?: string[];
  existingReports?: AbuseReport[];
  createdReports?: CreateAbuseReportData[];
} = {}): IAbuseRepository {
  const openDedupeKeys = new Set(setup.openDedupeKeys ?? []);
  const createdReports = setup.createdReports ?? [];

  return {
    async create(report) {
      createdReports.push(report);
      return makeReport({
        userId: report.userId,
        reason: report.reason,
        severity: report.severity,
        dedupeKey: report.dedupeKey ?? null,
        metadata: (report.metadata ?? null) as AbuseReport["metadata"]
      });
    },
    async createAutomaticOpen(report) {
      const key = `${report.userId}:${report.dedupeKey}`;

      if (openDedupeKeys.has(key)) {
        return null;
      }

      openDedupeKeys.add(key);
      createdReports.push(report);
      return makeReport({
        userId: report.userId,
        reason: report.reason,
        severity: report.severity,
        dedupeKey: report.dedupeKey,
        metadata: (report.metadata ?? null) as AbuseReport["metadata"]
      });
    },
    async findForUser() {
      return setup.existingReports ?? [];
    },
    async getCompletionStats() {
      return {
        completionsLastHour: setup.completionsLastHour ?? 0,
        repeatedTitleCompletionsToday: setup.repeatedTitleCompletionsToday ?? 0
      };
    }
  };
}

describe("AbuseService", () => {
  it("creates a low-severity manual report by default", async () => {
    const createdReports: CreateAbuseReportData[] = [];
    const service = new AbuseService(makeRepo({ createdReports }));

    const report = await service.fileManualAbuseReport("user-1", {
      reason: "Suspicious reward claim",
      metadata: { questId: "quest-1" }
    });

    expect(createdReports).toEqual([
      {
        userId: "user-1",
        reason: "Suspicious reward claim",
        severity: AbuseSeverity.LOW,
        metadata: { questId: "quest-1" }
      }
    ]);
    expect(report).toMatchObject({
      userId: "user-1",
      reason: "Suspicious reward claim",
      severity: AbuseSeverity.LOW,
      status: AbuseReportStatus.OPEN
    });
  });

  it("lists reports for the current user", async () => {
    const service = new AbuseService(
      makeRepo({
        existingReports: [
          makeReport({
            userId: "user-1",
            reason: "Repeated identical quest completions detected",
            severity: AbuseSeverity.MEDIUM
          })
        ]
      })
    );

    const reports = await service.fetchMyAbuseReports("user-1");

    expect(reports).toEqual([
      {
        id: "user-1-repeated-identical-quest-completions-detected",
        userId: "user-1",
        reason: "Repeated identical quest completions detected",
        severity: AbuseSeverity.MEDIUM,
        status: AbuseReportStatus.OPEN,
        metadata: null,
        createdAt: "2026-05-20T00:00:00.000Z"
      }
    ]);
  });

  it("creates rule reports for rapid completions and repeated quest titles", async () => {
    const createdReports: CreateAbuseReportData[] = [];
    const service = new AbuseService(
      makeRepo({
        completionsLastHour: 10,
        repeatedTitleCompletionsToday: 5,
        createdReports
      })
    );

    const reports = await service.auditQuestCompletion({
      userId: "user-1",
      questId: "quest-1",
      questTitle: "Daily review"
    });

    expect(reports.map((report) => report.reason)).toEqual([
      "Too many quests completed in a short time",
      "Repeated identical quest completions detected"
    ]);
    expect(createdReports).toEqual([
      {
        userId: "user-1",
        dedupeKey: AUTOMATIC_ABUSE_RULE_KEYS.rapidQuestCompletions,
        reason: "Too many quests completed in a short time",
        severity: AbuseSeverity.HIGH,
        metadata: {
          questId: "quest-1",
          completionsLastHour: 10
        }
      },
      {
        userId: "user-1",
        dedupeKey: AUTOMATIC_ABUSE_RULE_KEYS.repeatedQuestTitle,
        reason: "Repeated identical quest completions detected",
        severity: AbuseSeverity.MEDIUM,
        metadata: {
          questId: "quest-1",
          questTitle: "Daily review",
          repeatedTitleCompletionsToday: 5
        }
      }
    ]);
  });

  it("does not create duplicate open rule reports", async () => {
    const createdReports: CreateAbuseReportData[] = [];
    const service = new AbuseService(
      makeRepo({
        completionsLastHour: 12,
        repeatedTitleCompletionsToday: 5,
        openDedupeKeys: [`user-1:${AUTOMATIC_ABUSE_RULE_KEYS.rapidQuestCompletions}`],
        createdReports
      })
    );

    const reports = await service.auditQuestCompletion({
      userId: "user-1",
      questId: "quest-1",
      questTitle: "Daily review"
    });

    expect(reports.map((report) => report.reason)).toEqual(["Repeated identical quest completions detected"]);
    expect(createdReports).toHaveLength(1);
  });

  it("coalesces concurrent audits through stable automatic rule keys", async () => {
    const createdReports: CreateAbuseReportData[] = [];
    const service = new AbuseService(
      makeRepo({
        completionsLastHour: 12,
        repeatedTitleCompletionsToday: 6,
        createdReports
      })
    );
    const context = {
      userId: "user-1",
      questId: "quest-1",
      questTitle: "Daily review"
    };

    const outcomes = await Promise.all([
      service.auditQuestCompletion(context),
      service.auditQuestCompletion(context)
    ]);

    expect(outcomes.flat()).toHaveLength(2);
    expect(createdReports.map((report) => report.dedupeKey).sort()).toEqual([
      AUTOMATIC_ABUSE_RULE_KEYS.rapidQuestCompletions,
      AUTOMATIC_ABUSE_RULE_KEYS.repeatedQuestTitle
    ].sort());
  });

  it("does not create reports when completion stats are below thresholds", async () => {
    const createdReports: CreateAbuseReportData[] = [];
    const service = new AbuseService(
      makeRepo({
        completionsLastHour: 9,
        repeatedTitleCompletionsToday: 4,
        createdReports
      })
    );

    const reports = await service.auditQuestCompletion({
      userId: "user-1",
      questId: "quest-1",
      questTitle: "Daily review"
    });

    expect(reports).toEqual([]);
    expect(createdReports).toEqual([]);
  });
});
