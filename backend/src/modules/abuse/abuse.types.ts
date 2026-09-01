import type { AbuseReportStatus, AbuseSeverity, Prisma } from "@prisma/client";

export const AUTOMATIC_ABUSE_RULE_KEYS = {
  rapidQuestCompletions: "QUEST_COMPLETION_RAPID_HOURLY",
  repeatedQuestTitle: "QUEST_COMPLETION_REPEATED_TITLE_DAILY"
} as const;

export type CreateAbuseReportInput = {
  reason: string;
  severity?: AbuseSeverity;
  metadata?: Prisma.InputJsonObject;
};

export type AbuseReportDto = {
  id: string;
  userId: string;
  reason: string;
  severity: AbuseSeverity;
  status: AbuseReportStatus;
  metadata: unknown;
  createdAt: string;
};

export type AbuseRuleContext = {
  userId: string;
  questId: string;
  questTitle: string;
};
