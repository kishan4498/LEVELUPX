export type WeeklyReportSource = {
  from: Date;
  to: Date;
  activeUserCount: number;
  completedQuestCount: number;
  failedQuestCount: number;
  xpGenerated: number;
  coinsEarned: number;
  focusMinutes: number;
};

export type WeeklyReportSummary = {
  from: string;
  to: string;
  activeUserCount: number;
  completedQuestCount: number;
  failedQuestCount: number;
  completionRate: number;
  xpGenerated: number;
  coinsEarned: number;
  focusMinutes: number;
  averageFocusMinutesPerActiveUser: number;
  reportRecord: {
    id: string;
    filename: string;
    format: "CSV";
    storageKey: string | null;
    deliveryStatus: "DISABLED" | "PENDING_CONFIGURATION" | "READY_FOR_DELIVERY" | "SENT" | "FAILED";
    deliveryProvider: "NONE" | "EMAIL" | "LOCAL_OUTBOX";
    deliveryRecipientCount: number;
  } | null;
};
