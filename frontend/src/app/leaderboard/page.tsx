"use client";

import { clsx } from "clsx";
import { Clock, Medal, Sparkles, Trophy, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Notice } from "@/components/ui/Notice";
import { PageSection, PanelHeader, PanelTag, RouteFallback, SectionHeading, SupportingText, TableMessage } from "@/components/ui/PagePrimitives";
import { StatCard } from "@/components/ui/StatCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { apiRequest, errorMessage } from "@/lib/api";
import type { LeaderboardSnapshotsRefreshedPayload } from "@/lib/realtime";
import type { LeaderboardPeriod, LeaderboardRow } from "@/types/leaderboard";

const periods: { value: LeaderboardPeriod; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "ALL_TIME", label: "All time" }
];

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

export default function LeaderboardPage() {
  const { accessToken, user } = useRequireAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>("WEEKLY");
  const [rankings, setRankings] = useState<LeaderboardRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentRank = user ? rankings.find((ranking) => ranking.userId === user.id) ?? null : null;
  const leader = rankings[0] ?? null;
  const totalXp = rankings.reduce((total, ranking) => total + ranking.xp, 0);
  const focusMinutes = rankings.reduce((total, ranking) => total + ranking.focusMinutes, 0);

  const loadBoard = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { leaderboard } = await apiRequest<{ leaderboard: LeaderboardRow[] }>(
        `/leaderboard?period=${period}&limit=20`
      );
      setRankings(leaderboard);
    } catch (err) {
      setError(errorMessage(err, "Could not load leaderboard"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, period]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const handleRefresh = useCallback((refresh: LeaderboardSnapshotsRefreshedPayload) => {
    // Ignore refreshes for other leaderboard scopes.
    const scope = refresh.scopes.find((candidate) => candidate.guildId === null && candidate.period === period);

    if (!scope) {
      return;
    }

    setNotice(`Leaderboard refreshed with ${scope.rowsWritten} global rows.`);
    void loadBoard();
  }, [loadBoard, period]);

  const handlers = useMemo(
    () => ({
      connect: () => setConnected(true),
      disconnect: () => setConnected(false),
      "leaderboard.snapshots.refreshed": handleRefresh
    }),
    [handleRefresh]
  );

  useRealtimeSocket({
    accessToken,
    handlers
  });

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Leaderboard" title="Global rankings">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="rounded-lg bg-ink p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-white/10 text-mint">
              <Trophy size={22} />
            </div>
            <h2 className="text-xl font-bold">{leader ? `${leader.name} leads this board` : "No rankings yet"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
              Rankings are ordered by XP first, then focus minutes as the tie breaker.
            </p>
            <p className="mt-3 text-sm font-semibold text-white/55">
              Realtime leaderboard refresh {connected ? "connected" : "connecting"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/8 p-2">
            {periods.map((periodOption) => (
              <button
                className={clsx(
                  "h-10 rounded-md px-3 text-sm font-semibold transition",
                  period === periodOption.value ? "bg-white text-ink" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
                key={periodOption.value}
                onClick={() => setPeriod(periodOption.value)}
                type="button"
              >
                {periodOption.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard icon={UsersRound} iconClass="text-mint" label="Ranked users" metric={rankings.length} />
        <StatCard icon={Sparkles} iconClass="text-violet" label="Board XP" metric={totalXp} />
        <StatCard icon={Clock} iconClass="text-ember" label="Focus minutes" metric={focusMinutes} />
        <StatCard icon={Medal} iconClass="text-mint" label="Your rank" metric={currentRank ? `#${currentRank.rank}` : "-"} />
      </section>

      <PageSection>
        <PanelHeader>
          <div>
            <SectionHeading>Top players</SectionHeading>
            <SupportingText spaced>Showing up to 20 users for the selected period.</SupportingText>
          </div>
          <PanelTag>
            {periods.find((periodOption) => periodOption.value === period)?.label}
          </PanelTag>
        </PanelHeader>

        <div className="mt-5 overflow-x-auto rounded-lg border border-ink/8">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[72px_1fr_110px_130px] bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
              <span>Rank</span>
              <span>User</span>
              <span className="text-right">XP</span>
              <span className="text-right">Focus</span>
            </div>

            {loading ? (
              <TableMessage>Loading leaderboard...</TableMessage>
            ) : rankings.length === 0 ? (
              <TableMessage>No leaderboard entries yet.</TableMessage>
            ) : (
              rankings.map((ranking) => {
                const isCurrentUser = ranking.userId === user?.id;

                return (
                  <div
                    className={clsx(
                      "grid grid-cols-[72px_1fr_110px_130px] items-center border-t border-ink/8 px-4 py-4 text-sm",
                      isCurrentUser ? "bg-mint/5" : "bg-white"
                    )}
                    key={ranking.userId}
                  >
                    <span
                      className={clsx("inline-flex h-8 w-12 items-center justify-center rounded-md font-bold", medalClass(ranking.rank))}
                    >
                      #{ranking.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{ranking.name}</p>
                      {isCurrentUser && <p className="mt-1 text-xs font-semibold text-mint">You</p>}
                    </div>
                    <span className="text-right font-semibold">{ranking.xp}</span>
                    <span className="text-right text-ink/60">{ranking.focusMinutes} min</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PageSection>
    </AppShell>
  );
}
