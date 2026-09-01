import type { AiInsight, AiPromptRun } from "@prisma/client";

import type { IAiInsightRepository } from "./aiInsight.repository.js";
import {
  buildAiInsightPromptPayload,
  enforceNonDiagnosticInsightCopy,
  resolveAiInsightPromptVersion,
  resolveAiInsightProviderConfig,
  RuleBasedAiInsightProvider,
  type IAiInsightProvider
} from "./aiInsight.provider.js";
import { AppError } from "../../common/errors/AppError.js";
import { writeLog } from "../../common/logger/logger.js";
import type {
  InsightDto,
  FeedbackInput,
  GenMeta,
  LearningAction,
  LearningSignal,
  LearningSummary,
  PromptRunSignal,
  PromptRegistryStatus,
  PromptRunDto,
  ScheduleStatus,
  NewInsight,
  TrainingDatasetDto,
  SchedulePlanDto,
  ScheduleStep
} from "./aiInsight.types.js";

export type GenResult = {
  insights: InsightDto[];
  meta: GenMeta;
};

function readBoolean(raw: string | undefined) {
  return raw === "true" || raw === "1";
}

function readPositiveNumber(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPercent(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function resolveInsightScheduleStatus(
  env: NodeJS.ProcessEnv = process.env,
  promptVersion: string = resolveAiInsightPromptVersion(env)
): ScheduleStatus {
  const cfg = resolveAiInsightProviderConfig(env);
  const hosted = readBoolean(env.AI_INSIGHT_SCHEDULE_ENABLED);
  const pct = readPercent(env.AI_INSIGHT_SCHEDULE_ROLLOUT_PERCENT, 100);
  const needsExternal = readBoolean(env.AI_INSIGHT_SCHEDULE_REQUIRE_EXTERNAL);
  const extReady = cfg.provider === "EXTERNAL_HTTP" && cfg.status === "ready";
  const extAuth =
    cfg.authHeaderName && cfg.authScheme ? `${cfg.authHeaderName}:${cfg.authScheme}` : null;
  const blockReason =
    hosted && needsExternal && !extReady
      ? "External provider is required for scheduled rollout but is not ready."
      : hosted && pct === 0
        ? "Scheduled rollout percent is 0."
        : null;

  return {
    jobName: "scheduled-insights",
    command: "npm run jobs:run -- scheduled-insights",
    cadence: "twice-daily",
    targetHoursUtc: [6, 18],
    dedupWindowHours: readPositiveNumber(env.AI_INSIGHT_SCHEDULE_DEDUP_HOURS, 12),
    hostedEnabled: hosted,
    effectiveHostedEnabled: hosted && !blockReason,
    hostedProvider: env.AI_INSIGHT_SCHEDULE_PROVIDER?.trim() || null,
    timezone: env.AI_INSIGHT_SCHEDULE_TIMEZONE?.trim() || "UTC",
    promptVersion,
    rolloutPercent: pct,
    externalProviderRequired: needsExternal,
    externalProviderReady: extReady,
    externalProviderName: cfg.externalProviderName,
    externalProviderAuth: extAuth,
    externalProviderRequestFormat: cfg.requestFormat,
    hostedRolloutReady: cfg.hostedRolloutReady,
    rolloutBlockedReason: blockReason
  };
}

export class AiInsightService {
  constructor(
    private readonly repo: IAiInsightRepository,
    private readonly provider: IAiInsightProvider = new RuleBasedAiInsightProvider(),
    private readonly fallback: IAiInsightProvider = new RuleBasedAiInsightProvider(),
    private readonly promptVersion: string = resolveAiInsightPromptVersion(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async fetchUserInsights(userId: string): Promise<InsightDto[]> {
    const insights = await this.repo.findForUser(userId);
    return insights.map((insight) => this.toDto(insight));
  }

  async fetchPromptRunHistory(userId: string): Promise<PromptRunDto[]> {
    const runs = await this.repo.findPromptRunsForUser(userId);
    return runs.map((run) => this.toRunDto(run));
  }

  async draftStudySchedule(userId: string): Promise<SchedulePlanDto> {
    const schedule = await this.repo.getStudyScheduleContext(userId);
    const now = this.now();
    const soonCutoff = new Date(now);
    soonCutoff.setUTCDate(now.getUTCDate() + 2);

    const overdue = schedule.quests.filter((quest) => quest.dueDate && quest.dueDate < now);
    const soon = schedule.quests.filter(
      (quest) => quest.dueDate && quest.dueDate >= now && quest.dueDate <= soonCutoff
    );
    const focusLoad = schedule.focusMinutesLast3Days;
    const riskLevel = focusLoad >= 360 || overdue.length >= 3 ? "HIGH" : focusLoad >= 180 || overdue.length > 0 ? "MEDIUM" : "LOW";
    const strategy =
      riskLevel === "HIGH" ? "RECOVERY" : overdue.length > 0 || soon.length >= 2 ? "DEADLINE_PUSH" : "BALANCED";
    const budget = strategy === "RECOVERY" ? 45 : strategy === "DEADLINE_PUSH" ? 90 : 75;
    const block = strategy === "RECOVERY" ? 15 : 25;
    // Deadline comes first, then already-started work, then larger tasks.
    const ordered = [...schedule.quests].sort((a, b) => {
      const aDue = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (aDue !== bDue) {
        return aDue - bDue;
      }

      if (a.status !== b.status) {
        return a.status === "IN_PROGRESS" ? -1 : 1;
      }

      return b.estimatedMinutes - a.estimatedMinutes;
    });
    const steps = this.buildSteps({ ordered, strategy, budget, block });

    return {
      generatedAt: now.toISOString(),
      strategy,
      riskLevel,
      focusBudgetMinutes: budget,
      recommendedBlockMinutes: block,
      backlogCount: schedule.quests.length,
      overdueCount: overdue.length,
      dueSoonCount: soon.length,
      recentFocusMinutes: schedule.focusMinutesLast3Days,
      activeFocusDaysLast7Days: schedule.activeFocusDaysLast7Days,
      steps
    };
  }

  async compileTrainingDataset(userId: string): Promise<TrainingDatasetDto> {
    const training = await this.repo.getSchedulingTrainingContext(userId);
    const signals = training.questOutcomes.map((quest) => {
      const leadTimeHours = quest.dueDate
        ? Math.round((quest.dueDate.getTime() - quest.createdAt.getTime()) / 36_000) / 100
        : null;
      const resolvedAfterDueDate = Boolean(quest.dueDate && quest.updatedAt > quest.dueDate);
      const completionLabel: "COMPLETED" | "FAILED" | "OPEN" =
        quest.status === "COMPLETED" ? "COMPLETED" : quest.status === "FAILED" ? "FAILED" : "OPEN";

      return {
        questId: quest.id,
        title: quest.title,
        category: quest.category,
        difficulty: quest.difficulty,
        estimatedMinutes: quest.estimatedMinutes,
        status: quest.status,
        leadTimeHours,
        resolvedAfterDueDate,
        completionLabel
      };
    });
    const completedCount = signals.filter((s) => s.completionLabel === "COMPLETED").length;
    const failedCount = signals.filter((s) => s.completionLabel === "FAILED").length;
    const readiness =
      signals.length >= 30 && completedCount >= 10
        ? "READY"
        : signals.length >= 5 || training.focusMinutesLast14Days > 0
          ? "COLLECTING"
          : "NOT_READY";

    return {
      generatedAt: new Date().toISOString(),
      readiness,
      sampleCount: signals.length,
      completedCount,
      failedCount,
      focusMinutesLast14Days: training.focusMinutesLast14Days,
      activeFocusDaysLast14Days: training.activeFocusDaysLast14Days,
      recommendedModelTarget: "Predict next focus block length and deadline-risk priority from quest outcomes and focus load.",
      signals
    };
  }

  async produceInsights(userId: string): Promise<GenResult> {
    const stats = await this.repo.getProductivityStats(userId);

    const startMs = Date.now();
    const { insights, src, didFallback } = await this.tryGenerate(userId, stats);
    const durationMs = Date.now() - startMs;

    const safeInsights = insights.map(enforceNonDiagnosticInsightCopy);
    const saved = await this.repo.createMany(userId, safeInsights, src);
    const reg = this.registryStatus();

    const meta: GenMeta = {
      providerSource: src,
      promptVersion: this.promptVersion,
      usedFallback: didFallback,
      insightCount: saved.length,
      durationMs
    };

    await this.repo.createPromptRun({
      userId,
      providerSource: src,
      promptVersion: meta.promptVersion,
      promptAudience: reg.promptAudience,
      maxInsights: reg.maxInsights,
      usedFallback: didFallback,
      insightCount: saved.length,
      durationMs,
      trigger: "MANUAL"
    });

    writeLog({
      level: "info",
      message: "ai_insights_generated",
      userId,
      provider: meta.providerSource,
      promptVersion: meta.promptVersion,
      usedFallback: meta.usedFallback,
      insightCount: meta.insightCount,
      durationMs: meta.durationMs
    });

    return {
      insights: saved.map((insight) => this.toDto(insight)),
      meta
    };
  }

  scheduleStatus(): ScheduleStatus {
    return resolveInsightScheduleStatus(process.env, this.promptVersion);
  }

  registryStatus(env: NodeJS.ProcessEnv = process.env): PromptRegistryStatus {
    const cfg = resolveAiInsightProviderConfig(env);
    const promptContract = buildAiInsightPromptPayload({
      version: cfg.promptVersion,
      audience: cfg.promptAudience,
      maxInsights: cfg.maxInsights
    });

    return {
      provider: cfg.provider,
      providerStatus: cfg.status,
      endpointConfigured: Boolean(cfg.endpoint),
      apiKeyConfigured: cfg.hasApiKey,
      externalProviderName: cfg.externalProviderName,
      externalAuthHeader: cfg.authHeaderName,
      externalAuthScheme: cfg.authScheme,
      externalRequestFormat: cfg.requestFormat,
      hostedRolloutReady: cfg.hostedRolloutReady,
      timeoutMs: cfg.timeoutMs,
      promptVersion: cfg.promptVersion,
      promptAudience: cfg.promptAudience,
      maxInsights: cfg.maxInsights,
      promptContract,
      rolloutNotes: this.rolloutNotes(cfg)
    };
  }

  async compileLearningSummary(userId: string): Promise<LearningSummary> {
    const [rated, runs] = await Promise.all([
      this.repo.findFeedbackForUser(userId),
      this.repo.findPromptRunsForUser(userId)
    ]);
    const helpful = rated.filter((insight) => insight.feedbackValue === "HELPFUL").length;
    const notHelpful = rated.filter((insight) => insight.feedbackValue === "NOT_HELPFUL").length;
    const total = helpful + notHelpful;
    const fallbackRunCount = runs.filter((run) => run.usedFallback).length;
    const providerSignals = this.toSignals(
      rated,
      (insight) => insight.providerSource ?? "rule-based",
      (provider) => provider.replace(/-/g, " ")
    );
    const typeSignals = this.toSignals(
      rated,
      (insight) => insight.insightType,
      (type) => type.toLowerCase().replace(/_/g, " ")
    );
    const promptVersionSignals = this.toRunSignals(runs);
    const tuningActions = this.buildTuningActions({
      totalFeedback: total,
      providerSignals,
      typeSignals,
      promptVersionSignals,
      fallbackRate: this.rate(fallbackRunCount, runs.length)
    });

    return {
      totalFeedback: total,
      helpful,
      notHelpful,
      helpfulRate: this.rate(helpful, total),
      promptRunCount: runs.length,
      fallbackRunCount,
      fallbackRate: this.rate(fallbackRunCount, runs.length),
      providerSignals,
      typeSignals,
      promptVersionSignals,
      latestFeedbackAt: rated[0]?.feedbackAt?.toISOString() ?? null,
      recommendation: this.recommendation(total, providerSignals, typeSignals, promptVersionSignals),
      tuningActions
    };
  }

  async submitFeedback(userId: string, insightId: string, feedback: FeedbackInput): Promise<InsightDto> {
    const insight = await this.repo.updateFeedback({
      userId,
      insightId,
      feedback
    });

    if (!insight) {
      throw new AppError("Insight not found", 404, "INSIGHT_NOT_FOUND");
    }

    return this.toDto(insight);
  }

  private async tryGenerate(
    userId: string,
    stats: Parameters<IAiInsightProvider["produceInsights"]>[0]["stats"]
  ): Promise<{ insights: NewInsight[]; src: string; didFallback: boolean }> {
    try {
      const insights = await this.provider.produceInsights({ userId, stats });

      if (insights.length > 0) {
        return { insights, src: this.provider.name, didFallback: false };
      }
    } catch {
      // Insight generation is best-effort; local rules keep the request usable.
    }

    const insights = await this.fallback.produceInsights({ userId, stats });
    return { insights, src: this.fallback.name, didFallback: true };
  }

  private toDto(insight: AiInsight): InsightDto {
    const safeCopy = enforceNonDiagnosticInsightCopy(insight);

    return {
      id: insight.id,
      insightType: insight.insightType,
      title: safeCopy.title,
      message: safeCopy.message,
      confidenceScore: insight.confidenceScore,
      feedbackValue: insight.feedbackValue,
      feedbackComment: insight.feedbackComment,
      feedbackAt: insight.feedbackAt?.toISOString() ?? null,
      generatedAt: insight.generatedAt.toISOString(),
      providerSource: insight.providerSource ?? null
    };
  }

  private toRunDto(run: AiPromptRun): PromptRunDto {
    return {
      id: run.id,
      providerSource: run.providerSource,
      promptVersion: run.promptVersion,
      promptAudience: run.promptAudience,
      maxInsights: run.maxInsights,
      usedFallback: run.usedFallback,
      insightCount: run.insightCount,
      durationMs: run.durationMs,
      trigger: run.trigger === "SCHEDULED" ? "SCHEDULED" : "MANUAL",
      createdAt: run.createdAt.toISOString()
    };
  }

  private buildSteps(plan: {
    ordered: {
      id: string;
      title: string;
      category: string;
      estimatedMinutes: number;
      dueDate: Date | null;
    }[];
    strategy: SchedulePlanDto["strategy"];
    budget: number;
    block: number;
  }): ScheduleStep[] {
    if (plan.ordered.length === 0) {
      return [
        {
          label: "Plan a fresh quest",
          detail: "No active quests are waiting, so create one clear task before starting a focus block.",
          minutes: plan.block,
          questId: null,
          questTitle: null
        }
      ];
    }

    const steps: ScheduleStep[] = [];
    let remaining = plan.budget;

    if (plan.strategy === "RECOVERY") {
      // Avoid recommending another full sprint after a heavy workload stretch.
      steps.push({
        label: "Recovery warm-up",
        detail: "Start with a short setup block so the schedule stays sustainable after a heavy stretch.",
        minutes: plan.block,
        questId: null,
        questTitle: null
      });
      remaining -= plan.block;
    }

    for (const quest of plan.ordered.slice(0, 4)) {
      if (remaining <= 0) {
        break;
      }

      const minutes = Math.min(plan.block, quest.estimatedMinutes, remaining);
      const dueLabel = quest.dueDate ? ` Due ${quest.dueDate.toISOString().slice(0, 10)}.` : "";

      steps.push({
        label: quest.category,
        detail: `${quest.title}.${dueLabel}`,
        minutes,
        questId: quest.id,
        questTitle: quest.title
      });
      remaining -= minutes;
    }

    if (remaining >= 10 && plan.strategy !== "DEADLINE_PUSH") {
      steps.push({
        label: "Review and reset",
        detail: "Use the final minutes to mark progress and pick the next quest before stopping.",
        minutes: Math.min(remaining, 15),
        questId: null,
        questTitle: null
      });
    }

    return steps;
  }

  private toSignals(
    insights: AiInsight[],
    getKey: (insight: AiInsight) => string,
    getLabel: (key: string) => string
  ): LearningSignal[] {
    const grouped = new Map<string, { helpful: number; notHelpful: number }>();

    for (const insight of insights) {
      const key = getKey(insight);
      const group = grouped.get(key) ?? { helpful: 0, notHelpful: 0 };

      if (insight.feedbackValue === "HELPFUL") {
        group.helpful += 1;
      }

      if (insight.feedbackValue === "NOT_HELPFUL") {
        group.notHelpful += 1;
      }

      grouped.set(key, group);
    }

    return [...grouped.entries()]
      .map(([key, group]) => {
        const total = group.helpful + group.notHelpful;

        return {
          key,
          label: getLabel(key),
          helpful: group.helpful,
          notHelpful: group.notHelpful,
          total,
          helpfulRate: this.rate(group.helpful, total)
        };
      })
      .sort((a, b) => b.total - a.total || b.helpfulRate - a.helpfulRate);
  }

  private toRunSignals(runs: AiPromptRun[]): PromptRunSignal[] {
    const grouped = new Map<
      string,
      {
        totalRuns: number;
        fallbackRuns: number;
        durationMs: number;
        totalInsights: number;
      }
    >();

    for (const run of runs) {
      const group = grouped.get(run.promptVersion) ?? {
        totalRuns: 0,
        fallbackRuns: 0,
        durationMs: 0,
        totalInsights: 0
      };
      group.totalRuns += 1;
      group.fallbackRuns += run.usedFallback ? 1 : 0;
      group.durationMs += run.durationMs;
      group.totalInsights += run.insightCount;
      grouped.set(run.promptVersion, group);
    }

    return [...grouped.entries()]
      .map(([key, group]) => ({
        key,
        label: key,
        totalRuns: group.totalRuns,
        fallbackRuns: group.fallbackRuns,
        fallbackRate: this.rate(group.fallbackRuns, group.totalRuns),
        averageDurationMs: group.totalRuns ? Math.round(group.durationMs / group.totalRuns) : 0,
        totalInsights: group.totalInsights
      }))
      .sort((a, b) => b.totalRuns - a.totalRuns || b.fallbackRate - a.fallbackRate);
  }

  private rate(part: number, total: number) {
    return total > 0 ? Math.round((part / total) * 100) : 0;
  }

  private rolloutNotes(cfg: ReturnType<typeof resolveAiInsightProviderConfig>) {
    if (cfg.provider === "RULES") {
      return [
        "Rule-based prompts are active.",
        "Set AI_INSIGHT_PROVIDER=external-http with endpoint credentials to test an external provider."
      ];
    }

    if (cfg.status !== "ready") {
      return [
        "External HTTP provider is selected but not ready.",
        "Configure AI_INSIGHT_ENDPOINT before enabling hosted rollout."
      ];
    }

    return [
      `${cfg.externalProviderName} is ready for manual and scheduled generation paths.`,
      "Monitor fallback rate and feedback quality before widening hosted rollout."
    ];
  }

  private recommendation(
    total: number,
    providerSignals: LearningSignal[],
    typeSignals: LearningSignal[],
    promptVersionSignals: PromptRunSignal[]
  ) {
    const worst = [...promptVersionSignals].sort((a, b) => b.fallbackRate - a.fallbackRate)[0];

    if (worst && worst.totalRuns >= 2 && worst.fallbackRate >= 50) {
      return `Review ${worst.label} provider readiness before increasing scheduled delivery.`;
    }

    if (total === 0) {
      return "Collect helpful or not helpful ratings before tuning provider prompts.";
    }

    const badType = [...typeSignals].sort((a, b) => a.helpfulRate - b.helpfulRate)[0];
    const badProvider = [...providerSignals].sort((a, b) => a.helpfulRate - b.helpfulRate)[0];

    if (badType && badType.total >= 2 && badType.helpfulRate < 50) {
      return `Review ${badType.label} prompt rules before expanding provider automation.`;
    }

    if (badProvider && badProvider.total >= 2 && badProvider.helpfulRate < 50) {
      return `Review ${badProvider.label} provider output before increasing scheduled delivery.`;
    }

    return "Feedback quality is stable enough to keep collecting signals before deeper prompt tuning.";
  }

  private buildTuningActions(summary: {
    totalFeedback: number;
    providerSignals: LearningSignal[];
    typeSignals: LearningSignal[];
    promptVersionSignals: PromptRunSignal[];
    fallbackRate: number;
  }): LearningAction[] {
    const actions: LearningAction[] = [];
    const badProvider = [...summary.providerSignals].sort((a, b) => a.helpfulRate - b.helpfulRate)[0];
    const badType = [...summary.typeSignals].sort((a, b) => a.helpfulRate - b.helpfulRate)[0];
    const worstPrompt = [...summary.promptVersionSignals].sort((a, b) => b.fallbackRate - a.fallbackRate)[0];

    if (worstPrompt && worstPrompt.totalRuns >= 2 && worstPrompt.fallbackRate >= 50) {
      actions.push({
        severity: "ACTION",
        title: "Reduce fallback rate",
        detail: `${worstPrompt.label} fell back on ${worstPrompt.fallbackRate}% of recent runs. Check provider health before expanding rollout.`
      });
    } else if (summary.fallbackRate >= 25) {
      actions.push({
        severity: "WATCH",
        title: "Watch provider stability",
        detail: `Recent prompt runs have a ${summary.fallbackRate}% fallback rate. Keep rollout gradual until fallback settles.`
      });
    }

    if (badProvider && badProvider.total >= 2 && badProvider.helpfulRate < 50) {
      actions.push({
        severity: "ACTION",
        title: "Tune provider output",
        detail: `${badProvider.label} has a ${badProvider.helpfulRate}% helpful rate across ${badProvider.total} ratings. Review prompt instructions or provider selection.`
      });
    }

    if (badType && badType.total >= 2 && badType.helpfulRate < 50) {
      actions.push({
        severity: "WATCH",
        title: "Review insight type",
        detail: `${badType.label} is underperforming. Tighten examples and thresholds for that recommendation type.`
      });
    }

    if (summary.totalFeedback < 5) {
      actions.push({
        severity: "INFO",
        title: "Collect more feedback",
        detail: "Use at least 5 ratings before making broad prompt or rollout changes."
      });
    }

    if (actions.length === 0) {
      actions.push({
        severity: "INFO",
        title: "Keep monitoring",
        detail: "Prompt feedback and fallback signals are stable enough to continue the current rollout."
      });
    }

    return actions;
  }
}
