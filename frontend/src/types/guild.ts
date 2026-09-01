export type GuildRole = "OWNER" | "MODERATOR" | "MEMBER";
export type GuildVisibility = "PUBLIC" | "PRIVATE";

export type GuildMember = {
  id: string;
  userId: string;
  name: string;
  role: GuildRole;
  joinedAt: string;
};

export type Guild = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  totalXp: number;
  visibility: GuildVisibility;
  inviteCode?: string;
  createdAt: string;
  members?: GuildMember[];
};

export type TeamQuestStatus = "ACTIVE" | "COMPLETED" | "FAILED" | "ARCHIVED";

export type TeamQuest = {
  id: string;
  guildId: string;
  title: string;
  targetType: string;
  targetValue: number;
  currentProgress: number;
  rewardXp: number;
  rewardCoins: number;
  startDate: string;
  endDate: string;
  status: TeamQuestStatus;
  repeatWeekly: boolean;
  recurrenceSeriesId: string | null;
  recurrenceWeekStart: string | null;
  sourceTeamQuestId: string | null;
  rewardPayout?: {
    paidMemberCount: number;
    xpPerMember: number;
    coinsPerMember: number;
    payoutMode: "CONTRIBUTORS" | "ALL_MEMBERS";
  };
};
