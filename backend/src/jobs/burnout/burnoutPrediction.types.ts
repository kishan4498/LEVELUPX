export type BurnoutStats = {
  userId: string;
  focusHoursLast3Days: number;
  failedTaskRateLast7Days: number;
  activeFocusDaysLast7Days: number;
};

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type BurnoutPred = {
  userId: string;
  riskLevel: RiskLevel;
  confidenceScore: number;
  reasons: string[];
};

export type BurnoutSummary = {
  usersScanned: number;
  insightsCreated: number;
  highRiskUsers: number;
  mediumRiskUsers: number;
  duplicateWarningsSkipped: number;
  feedbackSuppressedUsers: number;
};

export type BurnoutFeedbackSignal = {
  hasRecentWarning: boolean;
  hasRecentNegativeFeedback: boolean;
};
