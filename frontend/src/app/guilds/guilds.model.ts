import type {
  LeaderboardSnapshotsRefreshedPayload,
  TeamQuestProgressUpdatedPayload
} from "@/lib/realtime";
import type { Guild, TeamQuest } from "@/types/guild";
import type { LeaderboardPeriod } from "@/types/leaderboard";

export function formatGuildDate(dateIso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(dateIso));
}

export function mergeQuestProgress(
  teamQuests: TeamQuest[],
  progressEvent: TeamQuestProgressUpdatedPayload
) {
  return teamQuests.map((teamQuest) => {
    if (teamQuest.id !== progressEvent.teamQuestId) {
      return teamQuest;
    }

    return {
      ...teamQuest,
      currentProgress: progressEvent.currentProgress,
      targetValue: progressEvent.targetValue,
      status: progressEvent.status as TeamQuest["status"],
      ...(progressEvent.rewardPayout
        ? {
            rewardPayout: {
              ...progressEvent.rewardPayout
            } satisfies NonNullable<TeamQuest["rewardPayout"]>
          }
        : {})
    };
  });
}

export function questProgressUpdater(progressEvent: TeamQuestProgressUpdatedPayload) {
  return (teamQuests: TeamQuest[]) => mergeQuestProgress(teamQuests, progressEvent);
}

export function keepSelectedGuild(guilds: Guild[], selectedGuild: Guild | null) {
  if (!selectedGuild) {
    return guilds[0] ?? null;
  }

  return guilds.find((listedGuild) => listedGuild.id === selectedGuild.id) ?? guilds[0] ?? null;
}

export function findBoardScope(
  scopes: LeaderboardSnapshotsRefreshedPayload["scopes"],
  guildId: string,
  period: LeaderboardPeriod
) {
  return scopes.find((snapshot) => snapshot.guildId === guildId && snapshot.period === period);
}

export function guildMedalClass(rank: number) {
  if (rank === 1) {
    return "bg-ember/12 text-ember";
  }

  if (rank === 2) {
    return "bg-violet/12 text-violet";
  }

  if (rank === 3) {
    return "bg-mint/10 text-mint";
  }

  return "bg-ink/8 text-ink/55";
}
