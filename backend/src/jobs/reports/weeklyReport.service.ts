import type { IWeeklyReportRepository } from "./weeklyReport.repository.js";
import { LocalReportFileStorage, type IReportFileStorage } from "./reportFileStorage.js";
import {
  createWeeklyReportDeliverySenderFromEnv,
  resolveWeeklyReportDeliveryPlan,
  type WeeklyReportDeliveryInput,
  type WeeklyReportDeliveryResult,
  type IWeeklyReportDeliverySender
} from "./weeklyReportDelivery.js";
import type { WeeklyReportSummary } from "./weeklyReport.types.js";

export class WeeklyReportService {
  constructor(
    private readonly repo: IWeeklyReportRepository,
    private readonly storage: IReportFileStorage = new LocalReportFileStorage(),
    private readonly sender: IWeeklyReportDeliverySender = createWeeklyReportDeliverySenderFromEnv()
  ) {}

  async generate(schedule: { now?: Date } = {}): Promise<WeeklyReportSummary> {
    const { from, to } = this.previousWeek(schedule.now ?? new Date());
    const source = await this.repo.getWeeklyReportSource({ from, to });
    const resolved = source.completedQuestCount + source.failedQuestCount;
    const summary = {
      from: source.from.toISOString(),
      to: source.to.toISOString(),
      activeUserCount: source.activeUserCount,
      completedQuestCount: source.completedQuestCount,
      failedQuestCount: source.failedQuestCount,
      completionRate: resolved > 0 ? Math.round((source.completedQuestCount / resolved) * 100) : 0,
      xpGenerated: source.xpGenerated,
      coinsEarned: source.coinsEarned,
      focusMinutes: source.focusMinutes,
      averageFocusMinutesPerActiveUser:
        source.activeUserCount > 0 ? Math.round(source.focusMinutes / source.activeUserCount) : 0
    };
    const savedReport = await this.saveReport(summary, source.to);

    return {
      ...summary,
      reportRecord: savedReport
    };
  }

  private async saveReport(
    summary: Omit<WeeklyReportSummary, "reportRecord">,
    reportDate: Date
  ): Promise<WeeklyReportSummary["reportRecord"]> {
    const owner = await this.repo.findReportOwner();

    if (!owner) {
      return null;
    }

    const filename = `levelupx-weekly-platform-summary-${reportDate.toISOString().slice(0, 10)}.csv`;
    const body = this.toCsv(summary);
    const plan = resolveWeeklyReportDeliveryPlan();
    const file = await this.storage.store({
      filename,
      body
    });
    const delivery = await this.sendWithRetry({
      plan,
      filename,
      contentType: "text/csv; charset=utf-8",
      body
    });
    const report = await this.repo.createWeeklyReportRecord({
      adminUserId: owner.id,
      filename,
      contentType: "text/csv; charset=utf-8",
      sizeBytes: file?.sizeBytes ?? Buffer.byteLength(body),
      storageKey: file?.storageKey ?? null,
      metadata: {
        generatedFor: "WEEKLY_PLATFORM_SUMMARY",
        storage: file ? "LOCAL_FILE" : "METADATA_ONLY",
        delivery: {
          enabled: plan.enabled,
          provider: delivery.provider,
          emailProvider: plan.emailProvider ?? null,
          status: delivery.status,
          attempted: delivery.attempted,
          recipientCount: delivery.recipientCount,
          messageId: delivery.messageId ?? null,
          attemptCount: delivery.attemptCount,
          errorMessage: delivery.errorMessage ?? null
        },
        from: summary.from,
        to: summary.to
      }
    });

    return {
      id: report.id,
      filename: report.filename,
      format: "CSV",
      storageKey: report.storageKey,
      deliveryStatus: delivery.status,
      deliveryProvider: delivery.provider,
      deliveryRecipientCount: delivery.recipientCount
    };
  }

  private async sendWithRetry(delivery: WeeklyReportDeliveryInput): Promise<WeeklyReportDeliveryResult> {
    const maxAttempts = this.maxAttempts();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const sent = await this.sender.send(delivery);
        return {
          ...sent,
          attemptCount: sent.attempted ? attempt : sent.attemptCount
        };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      attempted: true,
      status: "FAILED",
      provider: delivery.plan.provider,
      recipientCount: delivery.plan.recipientEmails.length,
      attemptCount: maxAttempts,
      errorMessage: lastError instanceof Error ? lastError.message : "Weekly report delivery failed"
    };
  }

  private maxAttempts() {
    const parsed = Number(process.env.WEEKLY_REPORT_DELIVERY_MAX_ATTEMPTS);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return 1;
    }

    return Math.min(parsed, 5);
  }

  private toCsv(summary: Omit<WeeklyReportSummary, "reportRecord">) {
    const lines = [
      ["metric", "value"],
      ["from", summary.from],
      ["to", summary.to],
      ["activeUserCount", String(summary.activeUserCount)],
      ["completedQuestCount", String(summary.completedQuestCount)],
      ["failedQuestCount", String(summary.failedQuestCount)],
      ["completionRate", String(summary.completionRate)],
      ["xpGenerated", String(summary.xpGenerated)],
      ["coinsEarned", String(summary.coinsEarned)],
      ["focusMinutes", String(summary.focusMinutes)],
      ["averageFocusMinutesPerActiveUser", String(summary.averageFocusMinutesPerActiveUser)]
    ];

    return lines.map((fields) => fields.map((field) => this.escapeCsv(field)).join(",")).join("\n");
  }

  private escapeCsv(field: string) {
    if (!/[",\n\r]/.test(field)) {
      return field;
    }

    return `"${field.replaceAll('"', '""')}"`;
  }

  private previousWeek(now: Date) {
    const to = new Date(now);
    const from = new Date(to);
    from.setUTCDate(to.getUTCDate() - 6);
    from.setUTCHours(0, 0, 0, 0);

    return { from, to };
  }
}
