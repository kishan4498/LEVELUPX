import type { Difficulty, InsightType, QuestStatus } from "@prisma/client";

export type InsightDto = {
  id: string;
  insightType: InsightType;
  title: string;
  message: string;
  confidenceScore: number;
  feedbackValue: string | null;
  feedbackComment: string | null;
  feedbackAt: string | null;
  generatedAt: string;
  providerSource: string | null;
};

export type ProdStats = {
  focusHoursLast3Days: number;
  failedTaskRateLast7Days: number;
  completedQuestsLast7Days: number;
  activeFocusDaysLast7Days: number;
};

export type ScheduleQuest = {
  id: string;
  title: string;
  difficulty: Difficulty;
  category: string;
  estimatedMinutes: number;
  status: QuestStatus;
  dueDate: Date | null;
};

export type ScheduleCtx = {
  quests: ScheduleQuest[];
  focusMinutesLast3Days: number;
  activeFocusDaysLast7Days: number;
};

export type ScheduleStep = {
  label: string;
  detail: string;
  minutes: number;
  questId: string | null;
  questTitle: string | null;
};

export type SchedulePlanDto = {
  generatedAt: string;
  strategy: "RECOVERY" | "BALANCED" | "DEADLINE_PUSH";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  focusBudgetMinutes: number;
  recommendedBlockMinutes: number;
  backlogCount: number;
  overdueCount: number;
  dueSoonCount: number;
  recentFocusMinutes: number;
  activeFocusDaysLast7Days: number;
  steps: ScheduleStep[];
};

export type TrainingOutcome = {
  id: string;
  title: string;
  difficulty: Difficulty;
  category: string;
  estimatedMinutes: number;
  status: QuestStatus;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TrainingCtx = {
  questOutcomes: TrainingOutcome[];
  focusMinutesLast14Days: number;
  activeFocusDaysLast14Days: number;
};

export type TrainingSignalDto = {
  questId: string;
  title: string;
  category: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  status: QuestStatus;
  leadTimeHours: number | null;
  resolvedAfterDueDate: boolean;
  completionLabel: "COMPLETED" | "FAILED" | "OPEN";
};

export type TrainingDatasetDto = {
  generatedAt: string;
  readiness: "NOT_READY" | "COLLECTING" | "READY";
  sampleCount: number;
  completedCount: number;
  failedCount: number;
  focusMinutesLast14Days: number;
  activeFocusDaysLast14Days: number;
  recommendedModelTarget: string;
  signals: TrainingSignalDto[];
};

export type NewInsight = {
  insightType: InsightType;
  title: string;
  message: string;
  confidenceScore: number;
};

export type GenMeta = {
  providerSource: string;
  promptVersion: string;
  usedFallback: boolean;
  insightCount: number;
  durationMs: number;
};

export type InsightPromptRunTrigger = "MANUAL" | "SCHEDULED";

export type PromptRunDto = {
  id: string;
  providerSource: string;
  promptVersion: string;
  promptAudience: string;
  maxInsights: number;
  usedFallback: boolean;
  insightCount: number;
  durationMs: number;
  trigger: InsightPromptRunTrigger;
  createdAt: string;
};

export type NewPromptRun = {
  userId: string;
  providerSource: string;
  promptVersion: string;
  promptAudience: string;
  maxInsights: number;
  usedFallback: boolean;
  insightCount: number;
  durationMs: number;
  trigger: InsightPromptRunTrigger;
};

export type ScheduleStatus = {
  jobName: string;
  command: string;
  cadence: "twice-daily";
  targetHoursUtc: number[];
  dedupWindowHours: number;
  hostedEnabled: boolean;
  effectiveHostedEnabled: boolean;
  hostedProvider: string | null;
  timezone: string;
  promptVersion: string;
  rolloutPercent: number;
  externalProviderRequired: boolean;
  externalProviderReady: boolean;
  externalProviderName: string | null;
  externalProviderAuth: string | null;
  externalProviderRequestFormat: string;
  hostedRolloutReady: boolean;
  rolloutBlockedReason: string | null;
};

export type PromptRegistryStatus = {
  provider: "RULES" | "EXTERNAL_HTTP";
  providerStatus: "ready" | "missing-endpoint";
  endpointConfigured: boolean;
  apiKeyConfigured: boolean;
  externalProviderName: string | null;
  externalAuthHeader: string | null;
  externalAuthScheme: string | null;
  externalRequestFormat: string;
  hostedRolloutReady: boolean;
  timeoutMs: number;
  promptVersion: string;
  promptAudience: string;
  maxInsights: number;
  promptContract: {
    version: string;
    audience: string;
    maxInsights: number;
    allowedInsightTypes: InsightType[];
    instructions: string[];
    outputSchema: {
      insights: {
        insightType: string;
        title: string;
        message: string;
        confidenceScore: string;
      };
    };
  };
  rolloutNotes: string[];
};

export type LearningSignal = {
  key: string;
  label: string;
  helpful: number;
  notHelpful: number;
  total: number;
  helpfulRate: number;
};

export type PromptRunSignal = {
  key: string;
  label: string;
  totalRuns: number;
  fallbackRuns: number;
  fallbackRate: number;
  averageDurationMs: number;
  totalInsights: number;
};

export type LearningAction = {
  severity: "INFO" | "WATCH" | "ACTION";
  title: string;
  detail: string;
};

export type LearningSummary = {
  totalFeedback: number;
  helpful: number;
  notHelpful: number;
  helpfulRate: number;
  promptRunCount: number;
  fallbackRunCount: number;
  fallbackRate: number;
  providerSignals: LearningSignal[];
  typeSignals: LearningSignal[];
  promptVersionSignals: PromptRunSignal[];
  latestFeedbackAt: string | null;
  recommendation: string;
  tuningActions: LearningAction[];
};

export type FeedbackInput = {
  feedbackValue: "HELPFUL" | "NOT_HELPFUL";
  feedbackComment?: string | null;
};
