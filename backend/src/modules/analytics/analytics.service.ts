import { QuestStatus, type FocusSession, type Quest, type XpTransaction } from "@prisma/client";

import type { IAnalyticsRepository } from "./analytics.repository.js";
import { RuleBasedAnalyticsRecommendationProvider, type IAnalyticsRecommendationProvider } from "./analyticsRecommendation.provider.js";
import type { AnalyticsRecommendationDto, FocusConsistencyDto, HeatmapDayDto, WeeklySummaryDto } from "./analytics.types.js";

type DayBucket = {
  date: string;
  completedQuests: number;
  focusMinutes: number;
  xpGained: number;
};

export class AnalyticsService {
  constructor(
    private readonly repo: IAnalyticsRepository,
    private readonly provider: IAnalyticsRecommendationProvider = new RuleBasedAnalyticsRecommendationProvider(),
    private readonly fallback: IAnalyticsRecommendationProvider = new RuleBasedAnalyticsRecommendationProvider(),
    private readonly promptVersion = "analytics-rules-v1"
  ) {}

  async compileWeeklyReport(userId: string): Promise<WeeklySummaryDto> {
    const { from, to } = this.getLastDaysWindow(7);
    const [quests, xp, sessions] = await Promise.all([
      this.repo.findQuestsInWindow({ userId, from, to }),
      this.repo.findXpTransactionsInWindow({ userId, from, to }),
      this.repo.findFocusSessionsInWindow({ userId, from, to })
    ]);

    const completedQuests = quests.filter((quest) => quest.status === QuestStatus.COMPLETED).length;
    const failedQuests = quests.filter((quest) => quest.status === QuestStatus.FAILED).length;
    const resolved = completedQuests + failedQuests;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      completedQuests,
      failedQuests,
      xpGained: this.sumXp(xp),
      focusMinutes: this.sumFocusMinutes(sessions),
      completionRate: resolved ? Math.round((completedQuests / resolved) * 100) : 0
    };
  }

  async generateMonthlyHeatmap(userId: string): Promise<HeatmapDayDto[]> {
    const { from, to } = this.getLastDaysWindow(30);
    const [quests, xp, sessions] = await Promise.all([
      this.repo.findQuestsInWindow({ userId, from, to }),
      this.repo.findXpTransactionsInWindow({ userId, from, to }),
      this.repo.findFocusSessionsInWindow({ userId, from, to })
    ]);

    return this.buildHeatmap(from, to, quests, xp, sessions);
  }

  async analyzeFocusConsistency(userId: string): Promise<FocusConsistencyDto> {
    const heatmap = await this.generateMonthlyHeatmap(userId);
    const active = heatmap.filter((day) => day.focusMinutes > 0);
    const totalMinutes = active.reduce((total, day) => total + day.focusMinutes, 0);
    const bestDay = active.reduce<HeatmapDayDto | null>((best, day) => {
      if (!best || day.focusMinutes > best.focusMinutes) {
        return day;
      }

      return best;
    }, null);

    return {
      daysTracked: heatmap.length,
      activeDays: active.length,
      consistencyRate: heatmap.length ? Math.round((active.length / heatmap.length) * 100) : 0,
      averageFocusMinutesOnActiveDays:
        active.length ? Math.round(totalMinutes / active.length) : 0,
      bestFocusDay: bestDay
    };
  }

  async fetchAnalyticsRecommendations(userId: string): Promise<AnalyticsRecommendationDto> {
    const [summary, consistency] = await Promise.all([
      this.compileWeeklyReport(userId),
      this.analyzeFocusConsistency(userId)
    ]);
    const startMs = Date.now();
    const { recommendations, providerSource, usedFallback } = await this.generateRecommendations({
      summary,
      consistency
    });

    return {
      recommendations,
      meta: {
        providerSource,
        promptVersion: this.promptVersion,
        usedFallback,
        durationMs: Date.now() - startMs
      }
    };
  }

  private buildHeatmap(
    from: Date,
    to: Date,
    quests: Quest[],
    xp: XpTransaction[],
    sessions: FocusSession[]
  ): HeatmapDayDto[] {
    const buckets = new Map<string, DayBucket>();

    // Keep inactive days so the heatmap never shifts between requests.
    for (const date of this.eachDay(from, to)) {
      const key = this.toDateKey(date);
      buckets.set(key, {
        date: key,
        completedQuests: 0,
        focusMinutes: 0,
        xpGained: 0
      });
    }

    for (const quest of quests) {
      if (quest.status === QuestStatus.COMPLETED) {
        const key = this.toDateKey(quest.updatedAt);
        const bucket = buckets.get(key);

        if (bucket) {
          bucket.completedQuests += 1;
        }
      }
    }

    for (const transaction of xp) {
      const key = this.toDateKey(transaction.createdAt);
      const bucket = buckets.get(key);

      if (bucket) {
        bucket.xpGained += transaction.amount;
      }
    }

    for (const session of sessions) {
      const key = this.toDateKey(session.startTime);
      const bucket = buckets.get(key);

      if (bucket) {
        bucket.focusMinutes += session.durationMinutes ?? 0;
      }
    }

    return [...buckets.values()];
  }

  private getLastDaysWindow(days: number) {
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(to.getUTCDate() - (days - 1));
    from.setUTCHours(0, 0, 0, 0);

    return { from, to };
  }

  private eachDay(from: Date, to: Date) {
    const days: Date[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);

    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }

  private sumXp(transactions: XpTransaction[]) {
    return transactions.reduce((total, transaction) => total + transaction.amount, 0);
  }

  private sumFocusMinutes(sessions: FocusSession[]) {
    return sessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private async generateRecommendations(metrics: {
    summary: WeeklySummaryDto;
    consistency: FocusConsistencyDto;
  }) {
    try {
      const recommendations = await this.provider.generate(metrics);

      if (recommendations.length > 0) {
        return {
          recommendations,
          providerSource: this.provider.name,
          usedFallback: false
        };
      }
    } catch {
      // Recommendations are optional, so provider errors use the local fallback.
    }

    return {
      recommendations: await this.fallback.generate(metrics),
      providerSource: this.fallback.name,
      usedFallback: true
    };
  }
}
