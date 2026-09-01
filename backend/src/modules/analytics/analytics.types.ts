export type WeeklySummaryDto = {
  from: string;
  to: string;
  completedQuests: number;
  failedQuests: number;
  xpGained: number;
  focusMinutes: number;
  completionRate: number;
};

export type HeatmapDayDto = {
  date: string;
  completedQuests: number;
  focusMinutes: number;
  xpGained: number;
};

export type FocusConsistencyDto = {
  daysTracked: number;
  activeDays: number;
  consistencyRate: number;
  averageFocusMinutesOnActiveDays: number;
  bestFocusDay: HeatmapDayDto | null;
};

export type AnalyticsRecommendationMetaDto = {
  providerSource: string;
  promptVersion: string;
  usedFallback: boolean;
  durationMs: number;
};

export type AnalyticsRecommendationDto = {
  recommendations: string[];
  meta: AnalyticsRecommendationMetaDto;
};
