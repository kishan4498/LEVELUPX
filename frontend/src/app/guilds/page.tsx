"use client";

import clsx from "clsx";
import {
  Clock,
  Coins,
  Copy,
  Crown,
  Flag,
  Globe2,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  Medal,
  Plus,
  Repeat2,
  Shield,
  Sparkles,
  Target,
  Trophy,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AccountabilityPanel } from "@/components/accountability/AccountabilityPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { PagePanel, PanelTop, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { StatCard } from "@/components/ui/StatCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { apiRequest, errorMessage } from "@/lib/api";
import {
  type LeaderboardSnapshotsRefreshedPayload,
  type TeamQuestProgressUpdatedPayload
} from "@/lib/realtime";
import type { Guild, GuildVisibility, TeamQuest } from "@/types/guild";
import type { LeaderboardPeriod, LeaderboardRow } from "@/types/leaderboard";

const leaderboardPeriods: { value: LeaderboardPeriod; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "ALL_TIME", label: "All time" }
];
const emptyMessageClass = "rounded-md bg-paper px-3 py-2 text-sm text-ink/55";
const boardMessageClass = "px-4 py-4 text-sm text-ink/55";
const questRewardClasses = {
  xp: "inline-flex items-center gap-1 rounded-md bg-violet/10 px-2 py-1 text-violet",
  coins: "inline-flex items-center gap-1 rounded-md bg-ember/10 px-2 py-1 text-ember"
} as const;

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(dateIso));
}

function mergeQuestProgress(teamQuests: TeamQuest[], progressEvent: TeamQuestProgressUpdatedPayload) {
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

function questProgressUpdater(progressEvent: TeamQuestProgressUpdatedPayload) {
  return (teamQuests: TeamQuest[]) => mergeQuestProgress(teamQuests, progressEvent);
}

function keepSelectedGuild(guilds: Guild[], selectedGuild: Guild | null) {
  if (!selectedGuild) {
    return guilds[0] ?? null;
  }

  return guilds.find((listedGuild) => listedGuild.id === selectedGuild.id) ?? guilds[0] ?? null;
}

function findBoardScope(
  scopes: LeaderboardSnapshotsRefreshedPayload["scopes"],
  guildId: string,
  period: LeaderboardPeriod
) {
  return scopes.find((snapshot) => snapshot.guildId === guildId && snapshot.period === period);
}

function medalClass(rank: number) {
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

export default function GuildsPage() {
  const { accessToken, user } = useRequireAuth();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<GuildVisibility>("PUBLIC");
  const [inviteGuildId, setInviteGuildId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [newInvite, setNewInvite] = useState<string | null>(null);
  const [newInviteGuildId, setNewInviteGuildId] = useState<string | null>(null);
  const [teamQuests, setTeamQuests] = useState<TeamQuest[]>([]);
  const [questTitle, setQuestTitle] = useState("");
  const [targetType, setTargetType] = useState("QUESTS_COMPLETED");
  const [targetValue, setTargetValue] = useState(10);
  const [rewardXp, setRewardXp] = useState(100);
  const [rewardCoins, setRewardCoins] = useState(50);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [progressByQuest, setProgressByQuest] = useState<Record<string, number>>({});
  const [period, setPeriod] = useState<LeaderboardPeriod>("WEEKLY");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingQuest, setSavingQuest] = useState(false);
  const [pendingGuildId, setPendingGuildId] = useState<string | null>(null);
  const [pendingQuestId, setPendingQuestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const guildId = guild?.id ?? null;

  const membership = user ? guild?.members?.find((member) => member.userId === user.id) ?? null : null;
  const ownedCount = user ? guilds.filter((guild) => guild.ownerId === user.id).length : 0;
  const canManage = membership?.role === "OWNER" || membership?.role === "MODERATOR";
  const activeQuestCount = teamQuests.filter((quest) => quest.status === "ACTIVE").length;
  const currentRow = user ? leaderboard.find((memberRank) => memberRank.userId === user.id) ?? null : null;
  const boardXp = leaderboard.reduce((total, memberRank) => total + memberRank.xp, 0);
  const boardFocus = leaderboard.reduce((total, memberRank) => total + memberRank.focusMinutes, 0);

  const loadGuilds = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const guildList = await apiRequest<{ guilds: Guild[] }>("/guilds");
      setGuilds(guildList.guilds);
      setGuild((current) => keepSelectedGuild(guildList.guilds, current));
    } catch (err) {
      setError(errorMessage(err, "Could not load guilds"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadGuild = useCallback(async (id: string) => {
    setError(null);

    try {
      const guildDetail = await apiRequest<{ guild: Guild }>(`/guilds/${id}`);
      setGuild(guildDetail.guild);
    } catch (err) {
      setError(errorMessage(err, "Could not load guild detail"));
    }
  }, []);

  const loadQuests = useCallback(async (id: string) => {
    setError(null);

    try {
      const questList = await apiRequest<{ teamQuests: TeamQuest[] }>(`/guilds/${id}/team-quests`);
      setTeamQuests(questList.teamQuests);
    } catch (err) {
      setTeamQuests([]);
      setError(errorMessage(err, "Could not load team quests"));
    }
  }, []);

  const loadBoard = useCallback(async (id: string, boardPeriod: LeaderboardPeriod) => {
    setBoardLoading(true);
    setError(null);

    try {
      const guildBoard = await apiRequest<{ leaderboard: LeaderboardRow[] }>(
        `/guilds/${id}/leaderboard?period=${boardPeriod}&limit=10`
      );
      setLeaderboard(guildBoard.leaderboard);
    } catch (err) {
      setLeaderboard([]);
      setError(errorMessage(err, "Could not load guild leaderboard"));
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuilds();
  }, [loadGuilds]);

  useEffect(() => {
    if (!guildId || !membership) {
      setTeamQuests([]);
      setLeaderboard([]);
      setConnected(false);
      return;
    }

    void loadQuests(guildId);
    void loadBoard(guildId, period);
  }, [guildId, loadBoard, loadQuests, membership, period]);

  useEffect(() => {
    if (!accessToken || !guildId || !membership) {
      return;
    }

    return () => {
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [accessToken, guildId, membership]);

  const queueRefresh = useCallback(() => {
    if (!guildId) {
      return;
    }

    // Debounce realtime bursts into one refresh.
    if (refreshTimer.current) {
      window.clearTimeout(refreshTimer.current);
    }

    refreshTimer.current = window.setTimeout(() => {
      void loadGuild(guildId);
      void loadQuests(guildId);
      void loadBoard(guildId, period);
    }, 250);
  }, [guildId, loadBoard, loadGuild, loadQuests, period]);

  const handlers = useMemo(
    () => ({
      connect: () => setConnected(true),
      disconnect: () => setConnected(false),
      "guild.member.changed": () => {
        setNotice("Guild membership changed. Refreshing guild detail.");
        queueRefresh();
      },
      "guild.teamQuest.created": () => {
        setNotice("A new team quest was added to this guild.");
        queueRefresh();
      },
      "guild.teamQuest.progressUpdated": (progressEvent: TeamQuestProgressUpdatedPayload) => {
        setNotice(progressEvent.rewardPayout ? "Team quest completed and rewards paid." : "Team quest progress updated.");
        setTeamQuests(questProgressUpdater(progressEvent));

        if (guildId) {
          void loadBoard(guildId, period);
        }
      },
      "leaderboard.snapshots.refreshed": (snapshotEvent: LeaderboardSnapshotsRefreshedPayload) => {
        if (!guildId) {
          return;
        }

        const scope = findBoardScope(snapshotEvent.scopes, guildId, period);

        if (!scope) {
          return;
        }

        setNotice(`Guild leaderboard refreshed with ${scope.rowsWritten} rows.`);
        void loadBoard(guildId, period);
      }
    }),
    [guildId, loadBoard, period, queueRefresh]
  );

  useRealtimeSocket({
    accessToken,
    guildId,
    enabled: Boolean(guildId && membership),
    handlers
  });

  async function createGuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const createdGuild = await apiRequest<{ guild: Guild }>("/guilds", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          visibility
        })
      });

      setName("");
      setDescription("");
      setVisibility("PUBLIC");
      setGuild(createdGuild.guild);
      setNewInvite(createdGuild.guild.inviteCode ?? null);
      setNewInviteGuildId(createdGuild.guild.inviteCode ? createdGuild.guild.id : null);
      setNotice(createdGuild.guild.inviteCode ? "Private guild created. Its new invite is shown below." : "Guild created.");
      await loadGuilds();
      await loadGuild(createdGuild.guild.id);
    } catch (err) {
      setError(errorMessage(err, "Could not create guild"));
    } finally {
      setSaving(false);
    }
  }

  async function joinGuild(guildId: string, code?: string) {
    setPendingGuildId(guildId);
    setError(null);
    setNotice(null);

    try {
      const joinedGuild = await apiRequest<{ guild: Guild }>(`/guilds/${guildId}/join`, {
        method: "POST",
        body: JSON.stringify(code ? { inviteCode: code } : {})
      });

      setGuild(joinedGuild.guild);
      setNotice("Joined guild.");
      await loadGuilds();
    } catch (err) {
      setError(errorMessage(err, "Could not join guild"));
    } finally {
      setPendingGuildId(null);
    }
  }

  async function joinPrivateGuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await joinGuild(inviteGuildId.trim(), inviteCode.trim());
    setInviteGuildId("");
    setInviteCode("");
  }

  async function rotateInviteCode(guildId: string) {
    setPendingGuildId(guildId);
    setError(null);
    setNotice(null);

    try {
      const invite = await apiRequest<{ inviteCode: string }>(`/guilds/${guildId}/invite-code`, {
        method: "POST"
      });
      setNewInviteGuildId(guildId);
      setNewInvite(invite.inviteCode);
      setNotice("The previous invite is invalid. Share the newly generated code.");
    } catch (err) {
      setError(errorMessage(err, "Could not rotate the invite code"));
    } finally {
      setPendingGuildId(null);
    }
  }

  async function copyPrivateInvite() {
    if (!newInvite || !newInviteGuildId) {
      return;
    }

    await navigator.clipboard.writeText(`${newInviteGuildId}:${newInvite}`);
    setNotice("Guild ID and invite code copied.");
  }

  async function leaveGuild(guildId: string) {
    setPendingGuildId(guildId);
    setError(null);
    setNotice(null);

    try {
      await apiRequest<void>(`/guilds/${guildId}/leave`, {
        method: "POST"
      });

      setNotice("Left guild.");
      await loadGuilds();
      await loadGuild(guildId);
    } catch (err) {
      setError(errorMessage(err, "Could not leave guild"));
    } finally {
      setPendingGuildId(null);
    }
  }

  async function createTeamQuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!guild) {
      return;
    }

    setSavingQuest(true);
    setError(null);
    setNotice(null);

    try {
      // datetime-local values need an explicit UTC conversion.
      await apiRequest<{ teamQuest: TeamQuest }>(`/guilds/${guild.id}/team-quests`, {
        method: "POST",
        body: JSON.stringify({
          title: questTitle,
          targetType,
          targetValue,
          rewardXp,
          rewardCoins,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          repeatWeekly
        })
      });

      setQuestTitle("");
      setTargetType("QUESTS_COMPLETED");
      setTargetValue(10);
      setRewardXp(100);
      setRewardCoins(50);
      setStartDate("");
      setEndDate("");
      setRepeatWeekly(false);
      setNotice("Team quest created.");
      await loadQuests(guild.id);
    } catch (err) {
      setError(errorMessage(err, "Could not create team quest"));
    } finally {
      setSavingQuest(false);
    }
  }

  async function updateProgress(questId: string) {
    if (!guild) {
      return;
    }

    setPendingQuestId(questId);
    setError(null);
    setNotice(null);

    try {
      const progressDelta = Number(progressByQuest[questId] ?? 1);
      await apiRequest<{ teamQuest: TeamQuest }>(`/guilds/${guild.id}/team-quests/${questId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progressDelta })
      });

      setProgressByQuest((current) => ({ ...current, [questId]: 1 }));
      setNotice("Team quest progress updated.");
      await loadQuests(guild.id);
    } catch (err) {
      setError(errorMessage(err, "Could not update team quest progress"));
    } finally {
      setPendingQuestId(null);
    }
  }

  function changeProgress(questId: string, amount: number) {
    setProgressByQuest((current) => ({ ...current, [questId]: amount }));
  }

  function renderGuildOverview(selectedGuild: Guild) {
    return (
      <>
        <PanelTop>
          <div>
            <p className="text-sm font-semibold text-mint">Created {formatDate(selectedGuild.createdAt)}</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold">
              {selectedGuild.name}
              {selectedGuild.visibility === "PRIVATE" && <LockKeyhole className="text-violet" size={19} />}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
              {selectedGuild.description || "This guild has not added a description yet."}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-violet/12 text-violet">
            <Flag size={24} />
          </div>
        </PanelTop>

        {membership && (
          <div className="mt-4 rounded-md bg-paper px-3 py-2 text-sm font-semibold text-ink/60">
            Realtime guild updates {connected ? "connected" : "connecting"}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <GuildMetric label="Members" metric={selectedGuild.members?.length ?? 0} />
          <GuildMetric label="Total XP" metric={selectedGuild.totalXp} />
          <GuildMetric label="Your role" metric={membership?.role ?? "None"} />
          <GuildMetric label="Active team quests" metric={activeQuestCount} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {membership ? (
            <>
              <Button
                disabled={pendingGuildId === selectedGuild.id || membership.role === "OWNER"}
                onClick={() => void leaveGuild(selectedGuild.id)}
                type="button"
                variant="ghost"
              >
                <LogOut size={18} />
                Leave guild
              </Button>
              {membership.role === "OWNER" && selectedGuild.visibility === "PRIVATE" && (
                <Button
                  disabled={pendingGuildId === selectedGuild.id}
                  onClick={() => void rotateInviteCode(selectedGuild.id)}
                  type="button"
                  variant="secondary"
                >
                  <KeyRound size={17} />
                  Rotate invite
                </Button>
              )}
            </>
          ) : (
            <Button
              disabled={pendingGuildId === selectedGuild.id}
              onClick={() => void joinGuild(selectedGuild.id)}
              type="button"
            >
              <LogIn size={18} />
              Join guild
            </Button>
          )}
        </div>
      </>
    );
  }

  function renderLeaderboard(userId: string) {
    return (
      <div className="mt-6">
        <div className="rounded-lg border border-ink/8 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionIntro
              description="Member rankings by XP, with focus minutes as the tie breaker."
              icon={Trophy}
              iconClass="bg-ember/12 text-ember"
              title="Guild leaderboard"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {leaderboardPeriods.map((boardPeriod) => (
                <PeriodButton
                  active={period === boardPeriod.value}
                  boardPeriod={boardPeriod}
                  key={boardPeriod.value}
                  onSelect={setPeriod}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <GuildMetric icon={UsersRound} iconClass="text-mint" label="Ranked" metric={leaderboard.length} />
            <GuildMetric icon={Sparkles} iconClass="text-violet" label="Board XP" metric={boardXp} />
            <GuildMetric
              icon={Medal}
              iconClass="text-ember"
              label="Your rank"
              metric={currentRow ? `#${currentRow.rank}` : "-"}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-ink/8">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[72px_1fr_100px_120px] bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
                <span>Rank</span>
                <span>Member</span>
                <BoardNumberHeading>XP</BoardNumberHeading>
                <BoardNumberHeading>Focus</BoardNumberHeading>
              </div>

              {!membership ? (
                <BoardMessage>Join this guild to see the leaderboard.</BoardMessage>
              ) : boardLoading ? (
                <BoardMessage>Loading guild leaderboard...</BoardMessage>
              ) : leaderboard.length === 0 ? (
                <BoardMessage>No guild leaderboard entries yet.</BoardMessage>
              ) : (
                leaderboard.map((memberRank) => (
                  <BoardRow current={memberRank.userId === userId} key={memberRank.userId} memberRank={memberRank} />
                ))
              )}
            </div>
          </div>

          <p className="mt-3 text-sm text-ink/45">Current board focus total: {boardFocus} minutes.</p>
        </div>
      </div>
    );
  }

  function renderMembers(selectedGuild: Guild) {
    return (
      <div className="mt-6">
        <SectionIntro
          description="Guild detail includes member roles."
          icon={UsersRound}
          iconClass="bg-ink/8 text-ink"
          title="Members"
        />
        <div className="mt-4 space-y-3">
          {!selectedGuild.members?.length ? (
            <GuildMessage>Open a guild to load members.</GuildMessage>
          ) : (
            selectedGuild.members.map((member) => <MemberRow key={member.id} member={member} />)
          )}
        </div>
      </div>
    );
  }

  function renderTeamQuests() {
    return (
      <div className="mt-6 border-t border-ink/8 pt-6">
        <SectionIntro
          description="Shared goals for guild members."
          icon={Target}
          iconClass="bg-mint/12 text-mint"
          title="Team quests"
        />

        {membership && canManage && (
          <form className="mt-5 rounded-lg border border-ink/8 p-4" onSubmit={createTeamQuest}>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                disabled={savingQuest}
                label="Quest title"
                name="teamQuestTitle"
                onChange={(event) => setQuestTitle(event.target.value)}
                value={questTitle}
              />
              <label className="grid gap-2 text-sm font-medium text-ink" htmlFor="teamQuestTargetType">
                <span>Target type</span>
                <select
                  className="h-11 rounded-md border border-ink/15 bg-white px-3 text-sm outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
                  disabled={savingQuest}
                  id="teamQuestTargetType"
                  onChange={(event) => setTargetType(event.target.value)}
                  value={targetType}
                >
                  <option value="QUESTS_COMPLETED">Quests completed</option>
                  <option value="FOCUS_MINUTES">Focus minutes</option>
                  <option value="XP_GAINED">XP gained</option>
                </select>
              </label>
              <Input
                disabled={savingQuest}
                label="Target value"
                min={1}
                name="teamQuestTargetValue"
                onChange={(event) => setTargetValue(Number(event.target.value))}
                type="number"
                value={targetValue}
              />
              <Input
                disabled={savingQuest}
                label="Reward XP"
                min={0}
                name="teamQuestRewardXp"
                onChange={(event) => setRewardXp(Number(event.target.value))}
                type="number"
                value={rewardXp}
              />
              <Input
                disabled={savingQuest}
                label="Reward coins"
                min={0}
                name="teamQuestRewardCoins"
                onChange={(event) => setRewardCoins(Number(event.target.value))}
                type="number"
                value={rewardCoins}
              />
              <Input
                disabled={savingQuest}
                label="Start date"
                name="teamQuestStartDate"
                onChange={(event) => setStartDate(event.target.value)}
                type="datetime-local"
                value={startDate}
              />
              <Input
                disabled={savingQuest}
                label="End date"
                name="teamQuestEndDate"
                onChange={(event) => setEndDate(event.target.value)}
                type="datetime-local"
                value={endDate}
              />
              <label className="flex items-center gap-3 rounded-md border border-ink/10 bg-paper px-3 py-3 text-sm font-semibold text-ink">
                <input
                  checked={repeatWeekly}
                  className="h-4 w-4 accent-violet"
                  disabled={savingQuest}
                  onChange={(event) => setRepeatWeekly(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Repeat weekly
                  <span className="mt-0.5 block text-xs font-normal text-ink/50">
                    Materialize the next instance at the same time next week.
                  </span>
                </span>
              </label>
            </div>
            <Button
              className="mt-4"
              disabled={savingQuest || questTitle.trim().length < 3 || !startDate || !endDate}
              type="submit"
            >
              <Plus size={18} />
              Create team quest
            </Button>
          </form>
        )}

        <div className="mt-5 space-y-3">
          {!membership ? (
            <GuildMessage>Join this guild to see team quests.</GuildMessage>
          ) : teamQuests.length === 0 ? (
            <GuildMessage>No team quests yet.</GuildMessage>
          ) : (
            teamQuests.map((quest) => (
              <TeamQuestCard
                busy={pendingQuestId === quest.id}
                key={quest.id}
                onChange={changeProgress}
                onUpdate={updateProgress}
                progressValue={progressByQuest[quest.id] ?? 1}
                quest={quest}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  if (!accessToken || !user) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Guilds" title="Guild hall">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Flag} iconClass="text-violet" label="Guilds" metric={guilds.length} />
        <StatCard icon={Crown} iconClass="text-ember" label="Owned by you" metric={ownedCount} />
        <StatCard icon={Sparkles} iconClass="text-mint" label="Selected guild XP" metric={guild?.totalXp ?? 0} />
      </section>

      <AccountabilityPanel accessToken={accessToken} enabled={Boolean(accessToken)} />

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <form className="rounded-lg bg-white p-6 shadow-panel" onSubmit={createGuild}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-mint/12 text-mint">
                <Plus size={20} />
              </div>
              <div>
                <SectionHeading>Create guild</SectionHeading>
                <SupportingText>Start a small group for shared progress.</SupportingText>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <Input
                disabled={saving}
                label="Guild name"
                name="name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              <VisibilityPicker onSelect={setVisibility} visibility={visibility} />
              <label className="grid gap-2 text-sm font-medium text-ink" htmlFor="description">
                <span>Description</span>
                <textarea
                  className="min-h-24 rounded-md border border-ink/15 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-ink/35 focus:border-mint focus:ring-2 focus:ring-mint/20"
                  disabled={saving}
                  id="description"
                  maxLength={500}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What is this guild working toward?"
                  value={description}
                />
              </label>
              <Button disabled={saving || name.trim().length < 3} type="submit">
                <Plus size={18} />
                Create
              </Button>
            </div>

            {newInvite && newInviteGuildId && (
              <PrivateInvite code={newInvite} guildId={newInviteGuildId} onCopy={copyPrivateInvite} />
            )}
          </form>

          <form className="rounded-md border border-line bg-white p-5 shadow-panel" onSubmit={joinPrivateGuild}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-violet/10 text-violet">
                <KeyRound size={19} />
              </span>
              <div>
                <h2 className="font-bold">Join a private guild</h2>
                <p className="mt-1 text-sm text-ink/50">Use the guild ID and code shared by its owner.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              <Input
                label="Guild ID"
                name="privateGuildId"
                onChange={(event) => setInviteGuildId(event.target.value)}
                required
                value={inviteGuildId}
              />
              <Input
                label="Invite code"
                name="privateGuildCode"
                onChange={(event) => setInviteCode(event.target.value)}
                required
                type="password"
                value={inviteCode}
              />
              <Button
                disabled={Boolean(pendingGuildId) || !inviteGuildId.trim() || inviteCode.trim().length < 12}
                type="submit"
                variant="secondary"
              >
                <LogIn size={17} />
                Join private guild
              </Button>
            </div>
          </form>

          <PagePanel>
            <SectionHeading>All guilds</SectionHeading>
            <div className="mt-4 space-y-3">
              {loading ? (
                <GuildMessage>Loading guilds...</GuildMessage>
              ) : guilds.length === 0 ? (
                <GuildMessage>No guilds have been created yet.</GuildMessage>
              ) : (
                guilds.map((listedGuild) => (
                  <GuildListItem
                    guild={listedGuild}
                    key={listedGuild.id}
                    onSelect={loadGuild}
                    selected={guild?.id === listedGuild.id}
                  />
                ))
              )}
            </div>
          </PagePanel>
        </div>

        <PagePanel>
          {guild ? (
            <>
              {renderGuildOverview(guild)}
              {renderLeaderboard(user.id)}
              {renderMembers(guild)}
              {renderTeamQuests()}
            </>
          ) : (
            <GuildMessage>Select or create a guild to see details.</GuildMessage>
          )}
        </PagePanel>
      </section>
    </AppShell>
  );
}

function GuildMessage({ children }: { children: ReactNode }) {
  return <p className={emptyMessageClass}>{children}</p>;
}

function BoardMessage({ children }: { children: ReactNode }) {
  return <p className={boardMessageClass}>{children}</p>;
}

function VisibilityButton({
  icon: Icon,
  label,
  onSelect,
  selected
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      className={clsx(
        "flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold",
        selected ? "bg-white text-ink shadow-sm" : "text-ink/50"
      )}
      onClick={onSelect}
      type="button"
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function VisibilityPicker({
  onSelect,
  visibility
}: {
  onSelect: (visibility: GuildVisibility) => void;
  visibility: GuildVisibility;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-ink">Visibility</span>
      <div className="mt-2 grid grid-cols-2 rounded-md border border-line bg-paper p-1">
        <VisibilityButton
          icon={Globe2}
          label="Public"
          onSelect={() => onSelect("PUBLIC")}
          selected={visibility === "PUBLIC"}
        />
        <VisibilityButton
          icon={LockKeyhole}
          label="Private"
          onSelect={() => onSelect("PRIVATE")}
          selected={visibility === "PRIVATE"}
        />
      </div>
    </div>
  );
}

function PrivateInvite({ code, guildId, onCopy }: { code: string; guildId: string; onCopy: () => Promise<void> }) {
  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">One-time private invite</p>
          <p className="mt-1 text-xs leading-5 text-ink/50">
            This plaintext code is shown only now. Rotating it invalidates the old one.
          </p>
        </div>
        <button
          aria-label="Copy private guild invitation"
          className="lx-button flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line text-violet hover:bg-paper"
          onClick={() => void onCopy()}
          title="Copy invite"
          type="button"
        >
          <Copy size={16} />
        </button>
      </div>
      <code className="mt-3 block overflow-x-auto rounded-md bg-ink px-3 py-3 text-xs text-white">
        {guildId}:{code}
      </code>
    </div>
  );
}

function SectionIntro({
  description,
  icon: Icon,
  iconClass,
  title
}: {
  description: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={clsx("flex h-10 w-10 items-center justify-center rounded-md", iconClass)}>
        <Icon size={20} />
      </div>
      <div>
        <h3 className="font-bold">{title}</h3>
        <SupportingText>{description}</SupportingText>
      </div>
    </div>
  );
}

function PeriodButton({
  active,
  boardPeriod,
  onSelect
}: {
  active: boolean;
  boardPeriod: (typeof leaderboardPeriods)[number];
  onSelect: (period: LeaderboardPeriod) => void;
}) {
  return (
    <button
      className={clsx(
        "h-9 rounded-md px-3 text-sm font-semibold transition",
        active ? "bg-ink text-white" : "bg-paper text-ink/65 hover:text-ink"
      )}
      onClick={() => onSelect(boardPeriod.value)}
      type="button"
    >
      {boardPeriod.label}
    </button>
  );
}

function BoardNumberHeading({ children }: { children: ReactNode }) {
  return <span className="text-right">{children}</span>;
}

function GuildListItem({
  guild,
  onSelect,
  selected
}: {
  guild: Guild;
  onSelect: (id: string) => Promise<void>;
  selected: boolean;
}) {
  return (
    <button
      className={clsx(
        "w-full rounded-lg border p-4 text-left transition",
        selected ? "border-ink bg-ink text-white" : "border-ink/8 bg-white text-ink hover:border-ink/30"
      )}
      onClick={() => void onSelect(guild.id)}
      type="button"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{guild.name}</span>
        <span className="flex items-center gap-2">
          {guild.visibility === "PRIVATE" ? <LockKeyhole size={14} /> : <Globe2 size={14} />}
          <span className={clsx("text-sm", selected ? "text-white/65" : "text-ink/50")}>{guild.totalXp} XP</span>
        </span>
      </div>
      <p className={clsx("mt-2 text-sm", selected ? "text-white/65" : "text-ink/55")}>
        {guild.description || "No description yet."}
      </p>
    </button>
  );
}

function GuildMetric({
  icon: Icon,
  iconClass,
  label,
  metric
}: {
  icon?: LucideIcon;
  iconClass?: string;
  label: string;
  metric: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-paper p-4">
      {Icon && <Icon className={clsx("mb-3", iconClass)} size={18} />}
      <SupportingText>{label}</SupportingText>
      <p className="mt-1 text-2xl font-bold">{metric}</p>
    </div>
  );
}

function BoardRow({ current, memberRank }: { current: boolean; memberRank: LeaderboardRow }) {
  return (
    <div
      className={clsx(
        "grid grid-cols-[72px_1fr_100px_120px] items-center border-t border-ink/8 px-4 py-4 text-sm",
        current ? "bg-mint/5" : "bg-white"
      )}
    >
      <span className={clsx("inline-flex h-8 w-12 items-center justify-center rounded-md font-bold", medalClass(memberRank.rank))}>
        #{memberRank.rank}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{memberRank.name}</p>
        {current && <p className="mt-1 text-xs font-semibold text-mint">You</p>}
      </div>
      <span className="text-right font-semibold">{memberRank.xp}</span>
      <span className="inline-flex items-center justify-end gap-1 text-right text-ink/60">
        <Clock size={14} />
        {memberRank.focusMinutes} min
      </span>
    </div>
  );
}

function MemberRow({ member }: { member: NonNullable<Guild["members"]>[number] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink/8 p-4">
      <div>
        <p className="font-semibold">{member.name}</p>
        <p className="mt-1 text-sm text-ink/50">Joined {formatDate(member.joinedAt)}</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-md bg-paper px-2 py-1 text-sm font-semibold text-ink/60">
        {member.role === "OWNER" ? <Crown size={15} /> : <Shield size={15} />}
        {member.role}
      </span>
    </div>
  );
}

function TeamQuestCard({
  busy,
  onChange,
  onUpdate,
  progressValue,
  quest
}: {
  busy: boolean;
  onChange: (questId: string, amount: number) => void;
  onUpdate: (questId: string) => Promise<void>;
  progressValue: number;
  quest: TeamQuest;
}) {
  const progress = Math.min(100, Math.round((quest.currentProgress / quest.targetValue) * 100));

  return (
    <div className="rounded-lg border border-ink/8 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{quest.title}</p>
          <p className="mt-1 text-sm text-ink/50">
            {quest.targetType} / {formatDate(quest.startDate)} - {formatDate(quest.endDate)}
          </p>
        </div>
        <span className="rounded-md bg-paper px-2 py-1 text-sm font-semibold text-ink/60">{quest.status}</span>
      </div>

      {quest.repeatWeekly && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-violet/10 px-2 py-1 text-xs font-bold text-violet">
          <Repeat2 size={14} />
          Weekly series
        </div>
      )}

      <div className="mt-4">
        <div className="flex justify-between text-sm font-semibold text-ink/60">
          <span>{quest.currentProgress}/{quest.targetValue}</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-ink/8">
          <div className="h-2 rounded-full bg-mint" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-ink/8 pt-4">
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <TeamQuestReward kind="xp">
            <Sparkles size={15} />
            {quest.rewardXp} XP
          </TeamQuestReward>
          <TeamQuestReward kind="coins">
            <Coins size={15} />
            {quest.rewardCoins} coins
          </TeamQuestReward>
        </div>

        {quest.status === "ACTIVE" && (
          <div className="flex items-end gap-2">
            <Input
              className="w-24"
              label="Progress"
              min={1}
              name={`progress-${quest.id}`}
              onChange={(event) => onChange(quest.id, Number(event.target.value))}
              type="number"
              value={progressValue}
            />
            <Button
              disabled={busy}
              onClick={() => void onUpdate(quest.id)}
              type="button"
              variant="secondary"
            >
              Update
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamQuestReward({ children, kind }: { children: ReactNode; kind: keyof typeof questRewardClasses }) {
  return <span className={questRewardClasses[kind]}>{children}</span>;
}
