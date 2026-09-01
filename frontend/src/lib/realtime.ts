import { io, type Socket } from "socket.io-client";

const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ??
  (process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, "") : "http://localhost:4000");

export type GuildMemberChangedPayload = {
  guildId: string;
  memberCount: number;
  action: "JOINED" | "LEFT";
};

export type TeamQuestCreatedPayload = {
  teamQuestId: string;
  title: string;
  targetType: string;
  targetValue: number;
  status: string;
};

export type TeamQuestProgressUpdatedPayload = {
  teamQuestId: string;
  currentProgress: number;
  targetValue: number;
  status: string;
  rewardPayout?: {
    paidMemberCount: number;
    xpPerMember: number;
    coinsPerMember: number;
    payoutMode: "CONTRIBUTORS" | "ALL_MEMBERS";
  };
};

export type LeaderboardSnapshotsRefreshedPayload = {
  refreshedScopes: number;
  rowsWritten: number;
  scopes: {
    guildId: string | null;
    period: string;
    rowsWritten: number;
  }[];
};

export type NotificationCountUpdatedPayload = {
  unreadCount: number;
};

export type AchievementUnlockedPayload = {
  achievementId: string;
  title: string;
  xpBonus: number;
  coinBonus: number;
};

export type FocusPresencePayload = {
  userId: string;
  sessionId: string;
  state: "FOCUSING" | "PAUSED" | "IDLE";
  sessionType: string;
  targetMinutes: number | null;
  startedAt: string;
  updatedAt: string;
};

export function createRealtimeSocket(session: { accessToken: string; guildId?: string | null }): Socket {
  return io(REALTIME_URL, {
    auth: {
      token: session.accessToken,
      ...(session.guildId ? { guildId: session.guildId } : {})
    },
    transports: ["websocket"]
  });
}
