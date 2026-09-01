export type ScheduledInsightSummary = {
  usersScanned: number;
  insightsGenerated: number;
  usersSkipped: number;
  providerSource: string;
  promptVersion: string;
  usedFallback: boolean;
};
