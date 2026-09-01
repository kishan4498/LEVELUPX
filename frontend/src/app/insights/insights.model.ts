import type {
  AiInsight,
  InsightLearningSummary,
  InsightScheduleStatus,
  SchedulingTrainingDataset,
  StudySchedulePlan
} from "@/types/insight";

export type InsightHistoryGroup = {
  day: string;
  insights: AiInsight[];
};

export const emptyScheduleStatus: InsightScheduleStatus = {
  jobName: "scheduled-insights",
  command: "npm run jobs:run -- scheduled-insights",
  cadence: "twice-daily",
  targetHoursUtc: [6, 18],
  dedupWindowHours: 12,
  hostedEnabled: false,
  effectiveHostedEnabled: false,
  hostedProvider: null,
  timezone: "UTC",
  promptVersion: "rules-v1",
  rolloutPercent: 100,
  externalProviderRequired: false,
  externalProviderReady: false,
  externalProviderName: null,
  externalProviderAuth: null,
  externalProviderRequestFormat: "levelupx-insight-v1",
  hostedRolloutReady: false,
  rolloutBlockedReason: null
};

export const emptyLearningSummary: InsightLearningSummary = {
  totalFeedback: 0,
  helpful: 0,
  notHelpful: 0,
  helpfulRate: 0,
  promptRunCount: 0,
  fallbackRunCount: 0,
  fallbackRate: 0,
  providerSignals: [],
  typeSignals: [],
  promptVersionSignals: [],
  latestFeedbackAt: null,
  recommendation: "Collect helpful or not helpful ratings before tuning provider prompts.",
  tuningActions: []
};

export const emptyStudyPlan: StudySchedulePlan = {
  generatedAt: "",
  strategy: "BALANCED",
  riskLevel: "LOW",
  focusBudgetMinutes: 0,
  recommendedBlockMinutes: 25,
  backlogCount: 0,
  overdueCount: 0,
  dueSoonCount: 0,
  recentFocusMinutes: 0,
  activeFocusDaysLast7Days: 0,
  steps: []
};

export const emptyTrainingDataset: SchedulingTrainingDataset = {
  generatedAt: "",
  readiness: "NOT_READY",
  sampleCount: 0,
  completedCount: 0,
  failedCount: 0,
  focusMinutesLast14Days: 0,
  activeFocusDaysLast14Days: 0,
  recommendedModelTarget: "Predict next focus block length and deadline-risk priority from quest outcomes and focus load.",
  signals: []
};

export function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(date));
}

export function providerLabel(provider: string | null | undefined) {
  return provider ? provider.replace(/-/g, " ") : "rule based";
}

export function strategyLabel(strategy: StudySchedulePlan["strategy"]) {
  return strategy.toLowerCase().replace(/_/g, " ");
}

export function riskClass(risk: StudySchedulePlan["riskLevel"]) {
  if (risk === "HIGH") {
    return "bg-ember/10 text-ember";
  }

  if (risk === "MEDIUM") {
    return "bg-violet/12 text-violet";
  }

  return "bg-mint/10 text-mint";
}

export function readinessClass(readiness: SchedulingTrainingDataset["readiness"]) {
  if (readiness === "READY") {
    return "bg-mint/10 text-mint";
  }

  if (readiness === "COLLECTING") {
    return "bg-violet/12 text-violet";
  }

  return "bg-ink/8 text-ink/55";
}

export function tuningClass(severity: InsightLearningSummary["tuningActions"][number]["severity"]) {
  if (severity === "ACTION") {
    return "bg-ember/10 text-ember";
  }

  return severity === "WATCH" ? "bg-violet/10 text-violet" : "bg-mint/10 text-mint";
}

export function getNextWindow(now = new Date()) {
  const next = new Date(now);
  const hours = [6, 18];
  const nextHour = hours.find((hour) => now.getHours() < hour);

  if (nextHour === undefined) {
    next.setDate(now.getDate() + 1);
    next.setHours(hours[0]!, 0, 0, 0);
  } else {
    next.setHours(nextHour, 0, 0, 0);
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(next);
}

export function groupInsights(insights: AiInsight[]) {
  return insights.reduce<InsightHistoryGroup[]>((groups, insight) => {
    const day = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(insight.generatedAt));
    const matchingGroup = groups.find((group) => group.day === day);

    if (matchingGroup) {
      matchingGroup.insights.push(insight);
    } else {
      groups.push({ day, insights: [insight] });
    }

    return groups;
  }, []);
}

export function replaceInsight(insights: AiInsight[], savedInsight: AiInsight) {
  return insights.map((insight) => (insight.id === savedInsight.id ? savedInsight : insight));
}
