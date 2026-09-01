import type { AdminReport } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { IWeeklyReportRepository } from "./weeklyReport.repository.js";
import { WeeklyReportService } from "./weeklyReport.service.js";
import type { WeeklyReportSource } from "./weeklyReport.types.js";

function makeSource(
  range: Pick<WeeklyReportSource, "from" | "to">,
  stats: Partial<Omit<WeeklyReportSource, "from" | "to">> = {}
): WeeklyReportSource {
  return {
    ...range,
    activeUserCount: 1,
    completedQuestCount: 1,
    failedQuestCount: 0,
    xpGenerated: 100,
    coinsEarned: 10,
    focusMinutes: 25,
    ...stats
  };
}

function makeRepo(overrides: Partial<IWeeklyReportRepository> = {}): IWeeklyReportRepository {
  return {
    async getWeeklyReportSource(range) {
      return makeSource(range);
    },
    async findReportOwner() {
      return null;
    },
    async createWeeklyReportRecord() {
      throw new Error("Not needed in this test");
    },
    ...overrides
  };
}

describe("WeeklyReportService", () => {
  it("generates a weekly platform summary", async () => {
    const repo = makeRepo({
      async getWeeklyReportSource(range) {
        return makeSource(range, {
          activeUserCount: 4,
          completedQuestCount: 8,
          failedQuestCount: 2,
          xpGenerated: 1200,
          coinsEarned: 240,
          focusMinutes: 360
        });
      }
    });

    const summary = await new WeeklyReportService(repo).generate({
      now: new Date("2026-05-20T12:00:00.000Z")
    });

    expect(summary).toEqual({
      from: "2026-05-14T00:00:00.000Z",
      to: "2026-05-20T12:00:00.000Z",
      activeUserCount: 4,
      completedQuestCount: 8,
      failedQuestCount: 2,
      completionRate: 80,
      xpGenerated: 1200,
      coinsEarned: 240,
      focusMinutes: 360,
      averageFocusMinutesPerActiveUser: 90,
      reportRecord: null
    });
  });

  it("handles empty weeks without dividing by zero", async () => {
    const repo = makeRepo({
      async getWeeklyReportSource(range) {
        return makeSource(range, {
          activeUserCount: 0,
          completedQuestCount: 0,
          failedQuestCount: 0,
          xpGenerated: 0,
          coinsEarned: 0,
          focusMinutes: 0
        });
      }
    });

    const summary = await new WeeklyReportService(repo).generate({
      now: new Date("2026-05-20T12:00:00.000Z")
    });

    expect(summary.completionRate).toBe(0);
    expect(summary.averageFocusMinutesPerActiveUser).toBe(0);
    expect(summary.reportRecord).toBeNull();
  });

  it("records weekly report metadata when an admin owner exists", async () => {
    const reports: {
      adminUserId: string;
      filename: string;
      contentType: string;
      sizeBytes: number;
      metadata: unknown;
    }[] = [];
    const repo = makeRepo({
      async getWeeklyReportSource(range) {
        return makeSource(range, {
          activeUserCount: 2,
          completedQuestCount: 3,
          failedQuestCount: 1,
          xpGenerated: 500,
          coinsEarned: 80,
          focusMinutes: 120
        });
      },
      async findReportOwner() {
        return { id: "admin-1" };
      },
      async createWeeklyReportRecord(report) {
        reports.push(report);

        return makeAdminReport({
          id: "weekly-report-1",
          adminUserId: report.adminUserId,
          filename: report.filename,
          contentType: report.contentType,
          sizeBytes: report.sizeBytes,
          metadata: null
        });
      }
    });

    const summary = await new WeeklyReportService(repo).generate({
      now: new Date("2026-05-21T12:00:00.000Z")
    });

    expect(reports[0]).toEqual(
      expect.objectContaining({
        adminUserId: "admin-1",
        filename: "levelupx-weekly-platform-summary-2026-05-21.csv",
        contentType: "text/csv; charset=utf-8",
        metadata: expect.objectContaining({
          generatedFor: "WEEKLY_PLATFORM_SUMMARY",
          storage: "METADATA_ONLY",
          from: "2026-05-15T00:00:00.000Z",
          to: "2026-05-21T12:00:00.000Z"
        })
      })
    );
    expect(reports[0].sizeBytes).toBeGreaterThan(0);
    expect(summary.reportRecord).toEqual({
      id: "weekly-report-1",
      filename: "levelupx-weekly-platform-summary-2026-05-21.csv",
      format: "CSV",
      storageKey: null,
      deliveryStatus: "DISABLED",
      deliveryProvider: "NONE",
      deliveryRecipientCount: 0
    });
  });

  it("stores the weekly report file when storage is configured", async () => {
    const reports: {
      storageKey?: string | null;
      sizeBytes: number;
      metadata: unknown;
    }[] = [];
    const repo = makeRepo({
      async findReportOwner() {
        return { id: "admin-1" };
      },
      async createWeeklyReportRecord(report) {
        reports.push(report);

        return makeAdminReport({
          id: "weekly-report-2",
          storageKey: report.storageKey ?? null,
          sizeBytes: report.sizeBytes
        });
      }
    });
    const storage = {
      async store() {
        return {
          storageKey: "2026-05-21/report.csv",
          sizeBytes: 321
        };
      },
      async read() {
        return null;
      }
    };

    const summary = await new WeeklyReportService(repo, storage).generate({
      now: new Date("2026-05-21T12:00:00.000Z")
    });

    expect(reports[0]).toEqual(
      expect.objectContaining({
        storageKey: "2026-05-21/report.csv",
        sizeBytes: 321,
        metadata: expect.objectContaining({
          storage: "LOCAL_FILE"
        })
      })
    );
    expect(summary.reportRecord?.storageKey).toBe("2026-05-21/report.csv");
  });

  it("keeps weekly report email delivery pending until credentials are configured", async () => {
    const previousEnabled = process.env.WEEKLY_REPORT_DELIVERY_ENABLED;
    const previousRecipients = process.env.WEEKLY_REPORT_RECIPIENT_EMAILS;
    process.env.WEEKLY_REPORT_DELIVERY_ENABLED = "true";
    process.env.WEEKLY_REPORT_RECIPIENT_EMAILS = "admin@example.com, owner@example.com";

    try {
      const reports: { metadata: unknown }[] = [];
      const repo = makeRepo({
        async findReportOwner() {
          return { id: "admin-1" };
        },
        async createWeeklyReportRecord(report) {
          reports.push({ metadata: report.metadata });
          return makeAdminReport({
            adminUserId: report.adminUserId,
            filename: report.filename,
            contentType: report.contentType,
            sizeBytes: report.sizeBytes,
            storageKey: report.storageKey ?? null
          });
        }
      });

      const summary = await new WeeklyReportService(repo).generate({
        now: new Date("2026-05-21T12:00:00.000Z")
      });

      expect(summary.reportRecord).toEqual(
        expect.objectContaining({
          deliveryStatus: "PENDING_CONFIGURATION",
          deliveryProvider: "EMAIL",
          deliveryRecipientCount: 2
        })
      );
      expect(reports[0].metadata).toEqual(
        expect.objectContaining({
          delivery: expect.objectContaining({
            enabled: true,
            provider: "EMAIL",
            emailProvider: "SMTP",
            status: "PENDING_CONFIGURATION",
            attempted: false,
            recipientCount: 2
          })
        })
      );
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.WEEKLY_REPORT_DELIVERY_ENABLED;
      } else {
        process.env.WEEKLY_REPORT_DELIVERY_ENABLED = previousEnabled;
      }

      if (previousRecipients === undefined) {
        delete process.env.WEEKLY_REPORT_RECIPIENT_EMAILS;
      } else {
        process.env.WEEKLY_REPORT_RECIPIENT_EMAILS = previousRecipients;
      }
    }
  });

  it("records sent delivery metadata when a configured sender succeeds", async () => {
    const reports: { metadata: unknown }[] = [];
    const repo = makeRepo({
      async findReportOwner() {
        return { id: "admin-1" };
      },
      async createWeeklyReportRecord(report) {
        reports.push({ metadata: report.metadata });
        return makeAdminReport({
          adminUserId: report.adminUserId,
          filename: report.filename,
          contentType: report.contentType,
          sizeBytes: report.sizeBytes,
          storageKey: report.storageKey ?? null
        });
      }
    });
    const sender = {
      async send() {
        return {
          attempted: true,
          status: "SENT" as const,
          provider: "LOCAL_OUTBOX" as const,
          recipientCount: 1,
          attemptCount: 1,
          messageId: "message-1"
        };
      }
    };

    const summary = await new WeeklyReportService(repo, undefined, sender).generate({
      now: new Date("2026-05-21T12:00:00.000Z")
    });

    expect(summary.reportRecord).toEqual(
      expect.objectContaining({
        deliveryStatus: "SENT",
        deliveryProvider: "LOCAL_OUTBOX",
        deliveryRecipientCount: 1
      })
    );
    expect(reports[0].metadata).toEqual(
      expect.objectContaining({
        delivery: expect.objectContaining({
          provider: "LOCAL_OUTBOX",
          status: "SENT",
          attempted: true,
          recipientCount: 1,
          messageId: "message-1"
        })
      })
    );
  });

  it("retries weekly report delivery before recording failure metadata", async () => {
    const previousAttempts = process.env.WEEKLY_REPORT_DELIVERY_MAX_ATTEMPTS;
    process.env.WEEKLY_REPORT_DELIVERY_MAX_ATTEMPTS = "2";

    try {
      const reports: { metadata: unknown }[] = [];
      const repo = makeRepo({
        async findReportOwner() {
          return { id: "admin-1" };
        },
        async createWeeklyReportRecord(report) {
          reports.push({ metadata: report.metadata });
          return makeAdminReport({
            adminUserId: report.adminUserId,
            filename: report.filename,
            contentType: report.contentType,
            sizeBytes: report.sizeBytes,
            storageKey: report.storageKey ?? null
          });
        }
      });
      let attempts = 0;
      const sender = {
        async send() {
          attempts += 1;
          throw new Error("mail provider unavailable");
        }
      };

      const summary = await new WeeklyReportService(repo, undefined, sender).generate({
        now: new Date("2026-05-21T12:00:00.000Z")
      });

      expect(attempts).toBe(2);
      expect(summary.reportRecord).toEqual(
        expect.objectContaining({
          deliveryStatus: "FAILED",
          deliveryProvider: "NONE",
          deliveryRecipientCount: 0
        })
      );
      expect(reports[0].metadata).toEqual(
        expect.objectContaining({
          delivery: expect.objectContaining({
            status: "FAILED",
            attempted: true,
            attemptCount: 2,
            errorMessage: "mail provider unavailable"
          })
        })
      );
    } finally {
      if (previousAttempts === undefined) {
        delete process.env.WEEKLY_REPORT_DELIVERY_MAX_ATTEMPTS;
      } else {
        process.env.WEEKLY_REPORT_DELIVERY_MAX_ATTEMPTS = previousAttempts;
      }
    }
  });
});

function makeAdminReport(overrides: Partial<AdminReport> = {}): AdminReport {
  return {
    id: "weekly-report-1",
    adminUserId: "admin-1",
    reportType: "WEEKLY_PLATFORM_SUMMARY",
    format: "CSV",
    filename: "levelupx-weekly-platform-summary-2026-05-21.csv",
    contentType: "text/csv; charset=utf-8",
    sizeBytes: 100,
    storageKey: null,
    metadata: null,
    createdAt: new Date("2026-05-21T12:00:00.000Z"),
    ...overrides
  };
}
