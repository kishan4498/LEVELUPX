export type InsightType =
  | "BURNOUT_WARNING"
  | "SCHEDULE_OPTIMIZATION"
  | "STUDY_SUGGESTION"
  | "CONSISTENCY_ANALYSIS"
  | "RECOVERY_RECOMMENDATION";

export type AiInsight = {
  id: string;
  insightType: InsightType;
  title: string;
  message: string;
  /** Legacy wire name. Rule-provider values are assigned guidance scores, not calibrated probabilities. */
  confidenceScore: number;
  feedbackValue: "HELPFUL" | "NOT_HELPFUL" | null;
  feedbackComment: string | null;
  feedbackAt: string | null;
  generatedAt: string;
  providerSource: string | null;
};

export type InsightGenerationMeta = {
  providerSource: string;
  promptVersion: string;
  usedFallback: boolean;
  insightCount: number;
  durationMs: number;
};

export type InsightScheduleStatus = {
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

export type InsightLearningSignal = {
  key: string;
  label: string;
  helpful: number;
  notHelpful: number;
  total: number;
  helpfulRate: number;
};

export type InsightPromptRunLearningSignal = {
  key: string;
  label: string;
  totalRuns: number;
  fallbackRuns: number;
  fallbackRate: number;
  averageDurationMs: number;
  totalInsights: number;
};

export type InsightLearningAction = {
  severity: "INFO" | "WATCH" | "ACTION";
  title: string;
  detail: string;
};

export type InsightLearningSummary = {
  totalFeedback: number;
  helpful: number;
  notHelpful: number;
  helpfulRate: number;
  promptRunCount: number;
  fallbackRunCount: number;
  fallbackRate: number;
  providerSignals: InsightLearningSignal[];
  typeSignals: InsightLearningSignal[];
  promptVersionSignals: InsightPromptRunLearningSignal[];
  latestFeedbackAt: string | null;
  recommendation: string;
  tuningActions: InsightLearningAction[];
};

export type StudySchedulePlanStep = {
  label: string;
  detail: string;
  minutes: number;
  questId: string | null;
  questTitle: string | null;
};

export type StudySchedulePlan = {
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
  steps: StudySchedulePlanStep[];
};

export type SchedulingTrainingSignal = {
  questId: string;
  title: string;
  category: string;
  difficulty: "EASY" | "MEDIUM" | "HARD" | "RECOVERY" | "BOSS";
  estimatedMinutes: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "ARCHIVED";
  leadTimeHours: number | null;
  resolvedAfterDueDate: boolean;
  completionLabel: "COMPLETED" | "FAILED" | "OPEN";
};

export type SchedulingTrainingDataset = {
  generatedAt: string;
  readiness: "NOT_READY" | "COLLECTING" | "READY";
  sampleCount: number;
  completedCount: number;
  failedCount: number;
  focusMinutesLast14Days: number;
  activeFocusDaysLast14Days: number;
  recommendedModelTarget: string;
  signals: SchedulingTrainingSignal[];
};
