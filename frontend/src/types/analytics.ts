export type WeeklySummary = {
  from: string;
  to: string;
  completedQuests: number;
  failedQuests: number;
  xpGained: number;
  focusMinutes: number;
  completionRate: number;
};

export type HeatmapDay = {
  date: string;
  completedQuests: number;
  focusMinutes: number;
  xpGained: number;
};

export type FocusConsistency = {
  daysTracked: number;
  activeDays: number;
  consistencyRate: number;
  averageFocusMinutesOnActiveDays: number;
  bestFocusDay: HeatmapDay | null;
};

export type AnalyticsRecommendationMeta = {
  providerSource: string;
  promptVersion: string;
  usedFallback: boolean;
  durationMs: number;
};

export type AnalyticsRecommendations = {
  recommendations: string[];
  meta: AnalyticsRecommendationMeta;
};
