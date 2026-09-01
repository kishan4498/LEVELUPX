import {
  enforceNonDiagnosticInsightCopy,
  resolveAiInsightPromptVersion,
  resolveAiInsightProviderConfig,
  RuleBasedAiInsightProvider,
  type IAiInsightProvider
} from "../../modules/ai-insights/aiInsight.provider.js";
import type { NewInsight } from "../../modules/ai-insights/aiInsight.types.js";
import type { IScheduledInsightRepository } from "./scheduledInsight.repository.js";
import type { ScheduledInsightSummary } from "./scheduledInsight.types.js";

const RECENT_INSIGHT_WINDOW_HOURS = 12;

export type ScheduledInsightRolloutControls = {
  rolloutPercent: number;
  externalProviderRequired: boolean;
  externalProviderReady: boolean;
  blockedReason: string | null;
};

export class ScheduledInsightService {
  constructor(
    private readonly repo: IScheduledInsightRepository,
    private readonly provider: IAiInsightProvider = new RuleBasedAiInsightProvider(),
    private readonly fallback: IAiInsightProvider = new RuleBasedAiInsightProvider(),
    private readonly version: string = resolveAiInsightPromptVersion()
  ) {}

  async run(schedule: { now?: Date } = {}): Promise<ScheduledInsightSummary> {
    const now = schedule.now ?? new Date();
    const weekAgo = this.daysAgo(now, 7);
    const threeDaysAgo = this.daysAgo(now, 3);
    const recentSince = this.hoursAgo(now, RECENT_INSIGHT_WINDOW_HOURS);

    const userIds = await this.repo.findActiveUserIds({
      from: weekAgo,
      to: now
    });

    let generated = 0;
    let skipped = 0;
    let source = this.provider.name;
    let fallbackUsed = false;
    const prompt = resolveAiInsightProviderConfig();
    const rollout = resolveScheduledInsightRolloutControls(process.env, prompt);

    if (rollout.blockedReason) {
      return {
        usersScanned: userIds.length,
        insightsGenerated: generated,
        usersSkipped: userIds.length,
        providerSource: source,
        promptVersion: this.version,
        usedFallback: fallbackUsed
      };
    }

    for (const userId of userIds) {
      if (!isUserInScheduledRollout(userId, rollout.rolloutPercent)) {
        skipped += 1;
        continue;
      }

      const hasRecent = await this.repo.hasRecentInsight({
        userId,
        since: recentSince
      });

      if (hasRecent) {
        skipped += 1;
        continue;
      }

      const stats = await this.repo.getProductivityStats({
        userId,
        from3Days: threeDaysAgo,
        from7Days: weekAgo,
        to: now
      });

      const started = Date.now();
      const { insights, providerSource, usedFallback } = await this.generate(userId, stats);
      const durationMs = Date.now() - started;
      const safeInsights = insights.map(enforceNonDiagnosticInsightCopy);

      if (safeInsights.length > 0) {
        await this.repo.createMany(userId, safeInsights, providerSource);
        await this.repo.createPromptRun({
          userId,
          providerSource,
          promptVersion: this.version,
          promptAudience: prompt.promptAudience,
          maxInsights: prompt.maxInsights,
          usedFallback,
          insightCount: safeInsights.length,
          durationMs,
          trigger: "SCHEDULED"
        });
        generated += safeInsights.length;
        source = providerSource;
        fallbackUsed = usedFallback;
      }
    }

    return {
      usersScanned: userIds.length,
      insightsGenerated: generated,
      usersSkipped: skipped,
      providerSource: source,
      promptVersion: this.version,
      usedFallback: fallbackUsed
    };
  }

  private async generate(
    userId: string,
    stats: Parameters<IAiInsightProvider["produceInsights"]>[0]["stats"]
  ): Promise<{ insights: NewInsight[]; providerSource: string; usedFallback: boolean }> {
    try {
      const insights = await this.provider.produceInsights({ userId, stats });

      if (insights.length > 0) {
        return { insights, providerSource: this.provider.name, usedFallback: false };
      }
    } catch {
      // Keep scheduled insights available when the configured provider is down.
    }

    const insights = await this.fallback.produceInsights({ userId, stats });
    return { insights, providerSource: this.fallback.name, usedFallback: true };
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

export function resolveScheduledInsightRolloutControls(
  env: NodeJS.ProcessEnv,
  providerSetup: ReturnType<typeof resolveAiInsightProviderConfig> = resolveAiInsightProviderConfig(env)
): ScheduledInsightRolloutControls {
  const rolloutPercent = readPercent(env.AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT, 100);
  const externalProviderRequired = env.AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL === "true" || env.AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL === "1";
  const externalProviderReady = providerSetup.provider === "EXTERNAL_HTTP" && providerSetup.status === "ready";
  const blockedReason = externalProviderRequired && !externalProviderReady ? "external-provider-not-ready" : null;

  return {
    rolloutPercent,
    externalProviderRequired,
    externalProviderReady,
    blockedReason
  };
}

export function isUserInScheduledRollout(userId: string, rolloutPercent: number) {
  if (rolloutPercent >= 100) {
    return true;
  }

  if (rolloutPercent <= 0) {
    return false;
  }

  return stablePercentBucket(userId) < rolloutPercent;
}

function stablePercentBucket(userId: string) {
  let hash = 0;

  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }

  return hash % 100;
}

function readPercent(rawPercent: string | undefined, fallback: number) {
  const parsed = Number(rawPercent);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}
