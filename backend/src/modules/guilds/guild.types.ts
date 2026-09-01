import type { GuildRole, GuildVisibility, TeamQuestStatus } from "@prisma/client";

export type CreateGuildInput = {
  name: string;
  description?: string;
  visibility?: GuildVisibility;
};

export type JoinGuildInput = {
  inviteCode?: string;
};

export type GuildMemberDto = {
  id: string;
  userId: string;
  name: string;
  role: GuildRole;
  joinedAt: string;
};

export type GuildResponseDto = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  totalXp: number;
  visibility: GuildVisibility;
  createdAt: string;
  members?: GuildMemberDto[];
  inviteCode?: string;
};

export type CreateTeamQuestInput = {
  title: string;
  targetType: string;
  targetValue: number;
  rewardXp: number;
  rewardCoins: number;
  startDate: string;
  endDate: string;
  repeatWeekly?: boolean;
};

export type UpdateTeamQuestProgressInput = {
  progressDelta: number;
};

export type TeamQuestDto = {
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
