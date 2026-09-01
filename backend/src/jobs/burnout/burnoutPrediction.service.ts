import { InsightType } from "@prisma/client";

import type { IBurnoutPredictionRepository } from "./burnoutPrediction.repository.js";
import type { BurnoutPred, BurnoutSummary, RiskLevel, BurnoutStats } from "./burnoutPrediction.types.js";

export class BurnoutPredictionService {
  constructor(private readonly repo: IBurnoutPredictionRepository) {}

  async run(schedule: { now?: Date } = {}): Promise<BurnoutSummary> {
    const now = schedule.now ?? new Date();
    const weekAgo = this.daysAgo(now, 7);
    const threeDaysAgo = this.daysAgo(now, 3);
    const warningSince = this.hoursAgo(now, 24);
    const feedbackSince = this.daysAgo(now, 14);
    const userIds = await this.repo.findActiveUserIds({
      from: weekAgo,
      to: now
    });
    const warnings: BurnoutPred[] = [];
    let dupeSkipped = 0;
    let suppressed = 0;

    for (const userId of userIds) {
      const stats = await this.repo.getUserStats({
        userId,
        from3Days: threeDaysAgo,
        from7Days: weekAgo,
        to: now
      });
      const prediction = this.predict(stats);

      if (!prediction) {
        continue;
      }

      const signal = await this.repo.getFeedbackSignal({
        userId,
        recentWarningFrom: warningSince,
        negativeFeedbackFrom: feedbackSince
      });

      if (signal.hasRecentNegativeFeedback) {
        suppressed += 1;
        continue;
      }

      if (signal.hasRecentWarning) {
        dupeSkipped += 1;
        continue;
      }

      warnings.push(prediction);
      await this.repo.createInsight(userId, {
        insightType: InsightType.BURNOUT_WARNING,
        title: `${prediction.riskLevel.toLowerCase()} workload strain signal`,
        message: `${prediction.reasons.join(" ")} This rule-based workload signal is not a medical assessment. Consider recovery quests, lighter sessions, or a rest block today.`,
        confidenceScore: prediction.confidenceScore
      });
    }

    return {
      usersScanned: userIds.length,
      insightsCreated: warnings.length,
      highRiskUsers: warnings.filter((warning) => warning.riskLevel === "HIGH").length,
      mediumRiskUsers: warnings.filter((warning) => warning.riskLevel === "MEDIUM").length,
      duplicateWarningsSkipped: dupeSkipped,
      feedbackSuppressedUsers: suppressed
    };
  }

  predict(stats: BurnoutStats): BurnoutPred | null {
    const reasons: string[] = [];
    let score = 0;

    if (stats.focusHoursLast3Days >= 18) {
      score += 3;
      reasons.push("Heavy focus time was logged over the last 3 days.");
    } else if (stats.focusHoursLast3Days >= 12) {
      score += 2;
      reasons.push("Focus time is elevated over the last 3 days.");
    }

    if (stats.failedTaskRateLast7Days >= 0.5) {
      score += 2;
      reasons.push("Failed quest rate is high over the last 7 days.");
    } else if (stats.failedTaskRateLast7Days >= 0.35) {
      score += 1;
      reasons.push("Failed quest rate is trending upward this week.");
    }

    if (stats.activeFocusDaysLast7Days >= 6) {
      score += 1;
      reasons.push("Focus activity has happened on most days this week.");
    }

    if (score < 3) {
      return null;
    }

    const riskLevel: RiskLevel = score >= 5 ? "HIGH" : "MEDIUM";

    return {
      userId: stats.userId,
      riskLevel,
      confidenceScore: riskLevel === "HIGH" ? 0.86 : 0.74,
      reasons
    };
  }

  private daysAgo(now: Date, days: number) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - days);
    return date;
  }

  private hoursAgo(now: Date, hours: number) {
    const date = new Date(now);
    date.setUTCHours(date.getUTCHours() - hours);
    return date;
  }
}
