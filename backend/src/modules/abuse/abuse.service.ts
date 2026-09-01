import { AbuseSeverity, type AbuseReport, type Prisma } from "@prisma/client";

import type { IAbuseRepository } from "./abuse.repository.js";
import {
  AUTOMATIC_ABUSE_RULE_KEYS,
  type AbuseReportDto,
  type AbuseRuleContext,
  type CreateAbuseReportInput
} from "./abuse.types.js";

export class AbuseService {
  constructor(private readonly repo: IAbuseRepository) {}

  async fileManualAbuseReport(userId: string, reportDraft: CreateAbuseReportInput): Promise<AbuseReportDto> {
    const saved = await this.repo.create({
      userId,
      reason: reportDraft.reason,
      severity: reportDraft.severity ?? AbuseSeverity.LOW,
      metadata: reportDraft.metadata
    });

    return this.toDto(saved);
  }

  async fetchMyAbuseReports(userId: string): Promise<AbuseReportDto[]> {
    const reports = await this.repo.findForUser(userId);
    return reports.map((report) => this.toDto(report));
  }

  async auditQuestCompletion(quest: AbuseRuleContext): Promise<AbuseReportDto[]> {
    const stats = await this.repo.getCompletionStats({
      userId: quest.userId,
      questTitle: quest.questTitle
    });
    const reports: AbuseReportDto[] = [];

    // Fast repeats can be legitimate, so flag them for review instead of blocking the user.
    if (stats.completionsLastHour >= 10) {
      const report = await this.createRuleReport({
        userId: quest.userId,
        dedupeKey: AUTOMATIC_ABUSE_RULE_KEYS.rapidQuestCompletions,
        reason: "Too many quests completed in a short time",
        severity: AbuseSeverity.HIGH,
        metadata: {
          questId: quest.questId,
          completionsLastHour: stats.completionsLastHour
        }
      });

      if (report) {
        reports.push(report);
      }
    }

    // Repeated titles are only a review signal; legitimate completions still go through.
    if (stats.repeatedTitleCompletionsToday >= 5) {
      const report = await this.createRuleReport({
        userId: quest.userId,
        dedupeKey: AUTOMATIC_ABUSE_RULE_KEYS.repeatedQuestTitle,
        reason: "Repeated identical quest completions detected",
        severity: AbuseSeverity.MEDIUM,
        metadata: {
          questId: quest.questId,
          questTitle: quest.questTitle,
          repeatedTitleCompletionsToday: stats.repeatedTitleCompletionsToday
        }
      });

      if (report) {
        reports.push(report);
      }
    }

    return reports;
  }

  private async createRuleReport(rule: {
    userId: string;
    dedupeKey: string;
    reason: string;
    severity: AbuseSeverity;
    metadata: Prisma.InputJsonObject;
  }) {
    const saved = await this.repo.createAutomaticOpen({
      userId: rule.userId,
      dedupeKey: rule.dedupeKey,
      reason: rule.reason,
      severity: rule.severity,
      metadata: rule.metadata
    });

    if (!saved) {
      return null;
    }

    return this.toDto(saved);
  }

  private toDto(report: AbuseReport): AbuseReportDto {
    return {
      id: report.id,
      userId: report.userId,
      reason: report.reason,
      severity: report.severity,
      status: report.status,
      metadata: report.metadata,
      createdAt: report.createdAt.toISOString()
    };
  }
}
