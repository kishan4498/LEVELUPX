import type { Role } from "@prisma/client";

export const realtimeEvents = {
  focusSessionStarted: "focus.session.started",
  focusSessionStopped: "focus.session.stopped",
  focusPresenceChanged: "focus.presence.changed",
  guildMemberChanged: "guild.member.changed",
  teamQuestCreated: "guild.teamQuest.created",
  teamQuestProgressUpdated: "guild.teamQuest.progressUpdated",
  achievementUnlocked: "achievement.unlocked",
  notificationCountUpdated: "notification.count.updated",
  leaderboardSnapshotsRefreshed: "leaderboard.snapshots.refreshed"
} as const;

export type RealtimeEventName = (typeof realtimeEvents)[keyof typeof realtimeEvents];

export type SocketUser = {
  id: string;
  email: string;
  role: Role;
};

export type RealtimeEvent =
  | {
      name: typeof realtimeEvents.focusSessionStarted | typeof realtimeEvents.focusSessionStopped;
      userId: string;
      payload: {
        sessionId: string;
        questId: string | null;
        completed?: boolean;
        durationMinutes?: number | null;
      };
    }
  | {
      name: typeof realtimeEvents.focusPresenceChanged;
      userIds: string[];
      payload: {
        userId: string;
        sessionId: string;
        state: "FOCUSING" | "PAUSED" | "IDLE";
        sessionType: string;
        targetMinutes: number | null;
        startedAt: string;
        updatedAt: string;
      };
    }
  | {
      name: typeof realtimeEvents.guildMemberChanged;
      guildId: string;
      payload: {
        guildId: string;
        memberCount: number;
        action: "JOINED" | "LEFT";
      };
    }
  | {
      name: typeof realtimeEvents.teamQuestCreated;
      guildId: string;
      payload: {
        teamQuestId: string;
        title: string;
        targetType: string;
        targetValue: number;
        status: string;
      };
    }
  | {
      name: typeof realtimeEvents.teamQuestProgressUpdated;
      guildId: string;
      payload: {
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
    }
  | {
      name: typeof realtimeEvents.achievementUnlocked;
      userId: string;
      payload: {
        achievementId: string;
        title: string;
        xpBonus: number;
        coinBonus: number;
      };
    }
  | {
      name: typeof realtimeEvents.notificationCountUpdated;
      userId: string;
      payload: {
        unreadCount: number;
      };
    }
  | {
      name: typeof realtimeEvents.leaderboardSnapshotsRefreshed;
      payload: {
        refreshedScopes: number;
        rowsWritten: number;
        scopes: {
          guildId: string | null;
          period: string;
          rowsWritten: number;
        }[];
      };
    };
