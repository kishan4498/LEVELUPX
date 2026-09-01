export type AbuseSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AbuseReportStatus = "OPEN" | "REVIEWED" | "ACTION_TAKEN" | "DISMISSED";

export type AbuseReport = {
  id: string;
  userId: string;
  reason: string;
  severity: AbuseSeverity;
  status: AbuseReportStatus;
  metadata: unknown;
  createdAt: string;
};
