"use client";

import clsx from "clsx";
import { CalendarDays, Filter, History, LockKeyhole, Medal, Search, Target, Trophy, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { EmptyPanelMessage, PageSection, PanelHeader, PanelTag, PanelTop, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { apiRequest, errorMessage } from "@/lib/api";
import type { AchievementUnlockedPayload } from "@/lib/realtime";
import type { Achievement, AchievementProgress, AchievementRarity } from "@/types/achievement";

type StatusFilter = "ALL" | "UNLOCKED" | "LOCKED";
type RarityFilter = "ALL" | AchievementRarity;
type CelebrationStage = "REVEAL" | "REWARDS" | "HISTORY";
type QueuedCelebration = AchievementUnlockedPayload & {
  sequenceId: string;
};
type AchievementHistoryGroup = {
  day: string;
  achievements: AchievementProgress[];
};

const rarityStyles: Record<AchievementRarity, string> = {
  COMMON: "bg-ink/10 text-ink",
  RARE: "bg-mint/10 text-mint",
  EPIC: "bg-violet/10 text-violet",
  LEGENDARY: "bg-ember/10 text-ember"
};

const confetti = Array.from({ length: 7 }, (_, i) => i);
const stages: CelebrationStage[] = ["REVEAL", "REWARDS", "HISTORY"];

function buildHistory(unlocks: AchievementProgress[]) {
  return unlocks.reduce<AchievementHistoryGroup[]>((groups, achievement) => {
    const day = achievement.unlockedAt ? formatDate(achievement.unlockedAt) : "Unknown date";
    const existing = groups.find((group) => group.day === day);

    if (existing) {
      existing.achievements.push(achievement);
    } else {
      groups.push({ day, achievements: [achievement] });
    }

    return groups;
  }, []);
}

function dropFirstCelebration(queue: QueuedCelebration[]) {
  return queue.slice(1);
}

function formatCondition(achievement: Achievement) {
  switch (achievement.conditionType) {
    case "QUESTS_COMPLETED":
      return `Complete ${achievement.conditionValue} quests`;
    case "TOTAL_XP":
      return `Earn ${achievement.conditionValue} total XP`;
    case "FOCUS_MINUTES":
      return `Log ${achievement.conditionValue} focus minutes`;
    default:
      return achievement.description;
  }
}

function formatProgress(achievement: AchievementProgress) {
  const currentValue = Math.min(achievement.currentValue, achievement.conditionValue);

  switch (achievement.conditionType) {
    case "QUESTS_COMPLETED":
      return `${currentValue}/${achievement.conditionValue} quests`;
    case "TOTAL_XP":
      return `${currentValue}/${achievement.conditionValue} XP`;
    case "FOCUS_MINUTES":
      return `${currentValue}/${achievement.conditionValue} minutes`;
    default:
      return `${achievement.progressPercent}% complete`;
  }
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(timestamp));
}

export default function AchievementsPage() {
  const { accessToken } = useRequireAuth();
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [queue, setQueue] = useState<QueuedCelebration[]>([]);
  const [stage, setStage] = useState<CelebrationStage>("REVEAL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [historyRarityFilter, setHistoryRarityFilter] = useState<RarityFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const unlocked = useMemo(() => achievements.filter((achievement) => achievement.unlocked), [achievements]);
  const celebration = queue[0] ?? null;
  const sequenceId = celebration?.sequenceId;
  const total = queue.length;
  const stageIndex = stages.indexOf(stage);

  const unlockHistory = useMemo(() => {
    const search = historySearch.trim().toLowerCase();

    return unlocked
      .filter((achievement) => {
        const rarityMatches = historyRarityFilter === "ALL" || achievement.rarity === historyRarityFilter;
        const searchMatches =
          !search ||
          achievement.title.toLowerCase().includes(search) ||
          achievement.description.toLowerCase().includes(search) ||
          achievement.rarity.toLowerCase().includes(search);

        return rarityMatches && searchMatches;
      })
      .sort((left, right) => {
        const leftTime = left.unlockedAt ? new Date(left.unlockedAt).getTime() : 0;
        const rightTime = right.unlockedAt ? new Date(right.unlockedAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [historyRarityFilter, historySearch, unlocked]);

  const historyGroups = useMemo(() => buildHistory(unlockHistory), [unlockHistory]);

  const filtered = useMemo(() => {
    return achievements.filter((achievement) => {
      const statusMatches =
        statusFilter === "ALL" ||
        (statusFilter === "UNLOCKED" && achievement.unlocked) ||
        (statusFilter === "LOCKED" && !achievement.unlocked);
      const rarityMatches = rarityFilter === "ALL" || achievement.rarity === rarityFilter;

      return statusMatches && rarityMatches;
    });
  }, [achievements, rarityFilter, statusFilter]);

  const totals = useMemo(() => {
    return achievements.reduce(
      (acc, achievement) => {
        if (achievement.unlocked) {
          acc.xp += achievement.xpBonus;
          acc.coins += achievement.coinBonus;
        }

        return acc;
      },
      { xp: 0, coins: 0 }
    );
  }, [achievements]);
  const collectionPercent = achievements.length > 0 ? Math.round((unlocked.length / achievements.length) * 100) : 0;
  const closest = useMemo(
    () =>
      [...achievements]
        .filter((achievement) => !achievement.unlocked)
        .sort((left, right) => right.progressPercent - left.progressPercent)[0] ?? null,
    [achievements]
  );

  const loadAchievements = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const progressList = await apiRequest<{ achievements: AchievementProgress[] }>("/users/me/achievements/progress");
      setAchievements(progressList.achievements);
    } catch (err) {
      setError(errorMessage(err, "Could not load achievements"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAchievements();
  }, [loadAchievements]);

  const handleUnlock = useCallback((unlock: AchievementUnlockedPayload) => {
    // Queue bursts so each unlock gets a celebration.
    seqRef.current += 1;
    setQueue((current) => [
      ...current,
      {
        ...unlock,
        sequenceId: `${unlock.achievementId}-${seqRef.current}`
      }
    ]);
    setStatusFilter("UNLOCKED");
    setRarityFilter("ALL");
    void loadAchievements();
  }, [loadAchievements]);

  const realtimeHandlers = useMemo(
    () => ({ "achievement.unlocked": handleUnlock }),
    [handleUnlock]
  );

  useRealtimeSocket({
    accessToken,
    handlers: realtimeHandlers
  });

  useEffect(() => {
    if (!sequenceId) {
      return;
    }

    setStage("REVEAL");
  }, [sequenceId]);

  useEffect(() => {
    if (!celebration) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        if (stage === "REVEAL") {
          setStage("REWARDS");
          return;
        }

        if (stage === "REWARDS") {
          setStage("HISTORY");
          return;
        }

        setQueue(dropFirstCelebration);
      },
      stage === "HISTORY" ? 2600 : 2200
    );
    return () => window.clearTimeout(timeout);
  }, [celebration, stage]);

  function dismissCelebration() {
    setQueue(dropFirstCelebration);
  }

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Achievements" title="Achievement hall">
      {error && <Notice tone="error">{error}</Notice>}

      {celebration && (
        <section className="levelupx-achievement-celebration relative mb-6 overflow-hidden rounded-lg border border-ember/20 bg-ink p-5 text-white shadow-panel">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {confetti.map((piece) => (
              <span className={clsx("levelupx-confetti", `levelupx-confetti-${piece % 7}`)} key={piece} />
            ))}
          </div>
          <PanelTop>
            <div className="flex min-w-0 gap-4">
              <div className="levelupx-medal-pulse flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-ember text-white">
                <Trophy size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ember">Achievement unlocked</p>
                <h2 className="mt-1 text-2xl font-bold">{celebration.title}</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {stages.map((phase, index) => (
                    <CelebrationStep
                      active={phase === stage || index < stageIndex}
                      index={index}
                      key={phase}
                      phase={phase}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                  <CelebrationChip tone="text-violet">{celebration.xpBonus} XP</CelebrationChip>
                  <CelebrationChip tone="text-ember">{celebration.coinBonus} coins</CelebrationChip>
                  {total > 1 && (
                    <CelebrationChip tone="text-white/70">
                      1/{total} queued
                    </CelebrationChip>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  {stage === "REVEAL"
                    ? "Your new badge is live."
                    : stage === "REWARDS"
                      ? `Bonus rewards added: ${celebration.xpBonus} XP and ${celebration.coinBonus} coins.`
                      : "This unlock has been added to your achievement history."}
                </p>
              </div>
            </div>
            <Button className="relative z-10 text-white hover:bg-white/10" onClick={dismissCelebration} type="button" variant="ghost">
              <X size={18} />
              {total > 1 ? "Next" : "Dismiss"}
            </Button>
          </PanelTop>
        </section>
      )}

      <section className="overflow-hidden rounded-md border border-ink bg-ink text-white shadow-command">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-6 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-bold text-gold">
              <Medal size={17} />
              <span>Collection progress</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{collectionPercent}% of the achievement hall unlocked</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Every badge records a real milestone and keeps its reward history visible.
            </p>
            <div className="mt-6 h-2 overflow-hidden rounded-md bg-white/10">
              <div
                aria-label={`${collectionPercent}% of achievements unlocked`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={collectionPercent}
                className="lx-progress-fill h-full rounded-md bg-gold"
                role="progressbar"
                style={{ width: `${collectionPercent}%` }}
              />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <CollectionMetric label="Unlocked" metric={`${unlocked.length}/${achievements.length}`} />
              <CollectionMetric label="Bonus XP" metric={totals.xp} />
              <CollectionMetric label="Bonus coins" metric={totals.coins} />
            </div>
          </div>
          <aside className="border-t border-white/10 bg-white/5 p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase text-white/45">Closest unlock</p>
            {closest ? (
              <>
                <span className="mt-5 flex h-10 w-10 items-center justify-center rounded-md bg-violet text-white"><Target size={19} /></span>
                <h3 className="mt-4 text-lg font-bold">{closest.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{formatCondition(closest)}</p>
                <p className="mt-4 text-sm font-bold text-gold">{formatProgress(closest)}</p>
              </>
            ) : (
              <>
                <Trophy className="mt-5 text-gold" size={25} />
                <h3 className="mt-4 font-bold">Collection complete</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">Every available achievement is in your history.</p>
              </>
            )}
          </aside>
        </div>
      </section>

      <PageSection>
        <PanelTop>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-mint/10 text-mint">
              <History size={20} />
            </div>
            <div>
              <SectionHeading>Unlock history</SectionHeading>
              <SupportingText>
                Showing {unlockHistory.length} of {unlocked.length} unlocked achievements.
              </SupportingText>
            </div>
          </div>
          <PanelTag>
            {totals.xp} XP / {totals.coins} coins earned
          </PanelTag>
        </PanelTop>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.45fr)]">
          <HistoryFilterField htmlFor="achievement-history-search" label="Search history">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" size={17} />
              <input
                className="h-11 w-full rounded-md border border-ink/10 bg-white pl-10 pr-3 text-sm font-normal outline-none transition placeholder:text-ink/35 focus:border-mint focus:ring-2 focus:ring-mint/20"
                id="achievement-history-search"
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Title, description, or rarity"
                value={historySearch}
              />
            </span>
          </HistoryFilterField>

          <HistoryFilterField htmlFor="achievement-history-rarity" label="Rarity">
            <select
              className="h-11 rounded-md border border-ink/10 bg-white px-3 text-sm font-normal outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
              id="achievement-history-rarity"
              onChange={(event) => setHistoryRarityFilter(event.target.value as RarityFilter)}
              value={historyRarityFilter}
            >
              {(["ALL", "COMMON", "RARE", "EPIC", "LEGENDARY"] as RarityFilter[]).map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity === "ALL" ? "All rarities" : rarity}
                </option>
              ))}
            </select>
          </HistoryFilterField>
        </div>

        <AchievementHistory
          groups={historyGroups}
          loading={loading}
          matchingUnlocks={unlockHistory.length}
          totalUnlocks={unlocked.length}
        />
      </PageSection>

      <PageSection>
        <PanelHeader>
          <div>
            <SectionHeading>All achievements</SectionHeading>
            <SupportingText spaced>Unlocked badges stay bright; locked badges show what to chase next.</SupportingText>
          </div>
          <PanelTag>
            {achievements.length - unlocked.length} locked
          </PanelTag>
        </PanelHeader>

        <div className="mt-5 grid gap-3 rounded-lg bg-paper p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink/60">
              <Filter size={16} />
              Status
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["ALL", "UNLOCKED", "LOCKED"] as StatusFilter[]).map((status) => (
                <FilterButton
                  active={statusFilter === status}
                  key={status}
                  label={status === "ALL" ? "All" : status === "UNLOCKED" ? "Unlocked" : "Locked"}
                  onClick={() => setStatusFilter(status)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink/60">Rarity</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(["ALL", "COMMON", "RARE", "EPIC", "LEGENDARY"] as RarityFilter[]).map((rarity) => (
                <FilterButton
                  active={rarityFilter === rarity}
                  key={rarity}
                  label={rarity === "ALL" ? "All" : rarity}
                  onClick={() => setRarityFilter(rarity)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {loading ? (
            <ListMessage>Loading achievements...</ListMessage>
          ) : achievements.length === 0 ? (
            <ListMessage>No achievements are available yet.</ListMessage>
          ) : filtered.length === 0 ? (
            <ListMessage>No achievements match these filters.</ListMessage>
          ) : (
            filtered.map((achievement) => (
              <AchievementCard achievement={achievement} key={achievement.id} />
            ))
          )}
        </div>
      </PageSection>
    </AppShell>
  );
}

function CelebrationStep({
  active,
  index,
  phase
}: {
  active: boolean;
  index: number;
  phase: CelebrationStage;
}) {
  return (
    <div
      className={clsx(
        "rounded-md border px-3 py-2 text-sm font-semibold transition",
        active ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-white/5 text-white/55"
      )}
    >
      <span className="block text-xs uppercase tracking-[0.12em] text-white/45">Step {index + 1}</span>
      {celebrationStageLabel(phase)}
    </div>
  );
}

function CelebrationChip({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={clsx("rounded-md bg-white/10 px-2 py-1", tone)}>{children}</span>;
}

function celebrationStageLabel(phase: CelebrationStage) {
  if (phase === "REVEAL") {
    return "Unlocked";
  }

  if (phase === "REWARDS") {
    return "Rewards";
  }

  return "History";
}

function HistoryFilterField({
  children,
  htmlFor,
  label
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function AchievementHistory({
  groups,
  loading,
  matchingUnlocks,
  totalUnlocks
}: {
  groups: AchievementHistoryGroup[];
  loading: boolean;
  matchingUnlocks: number;
  totalUnlocks: number;
}) {
  let content: ReactNode;

  if (loading) {
    content = <ListMessage>Loading unlock history...</ListMessage>;
  } else if (totalUnlocks === 0) {
    content = <ListMessage>No achievements unlocked yet.</ListMessage>;
  } else if (matchingUnlocks === 0) {
    content = <ListMessage>No unlocked achievements match this history filter.</ListMessage>;
  } else {
    content = groups.map((group) => <HistoryGroup key={group.day} section={group} />);
  }

  return <div className="mt-5 grid gap-4">{content}</div>;
}

function HistoryGroup({ section }: { section: AchievementHistoryGroup }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">
          <CalendarDays size={16} />
          {section.day}
        </span>
        <span className="text-sm font-semibold text-ink/45">
          {section.achievements.length} unlock{section.achievements.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {section.achievements.map((achievement) => (
          <HistoryCard achievement={achievement} key={achievement.id} />
        ))}
      </div>
    </div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={clsx(
        "h-10 rounded-md px-3 text-sm font-semibold transition",
        active ? "bg-ink text-white" : "bg-white text-ink/65 hover:text-ink"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ListMessage({ children }: { children: ReactNode }) {
  return <EmptyPanelMessage>{children}</EmptyPanelMessage>;
}

const rewardChipClasses = {
  xp: "rounded-md bg-violet/10 px-2 py-1 text-violet",
  coins: "rounded-md bg-ember/10 px-2 py-1 text-ember"
};

function RewardChip({
  children,
  kind
}: {
  children: ReactNode;
  kind: keyof typeof rewardChipClasses;
}) {
  return <span className={rewardChipClasses[kind]}>{children}</span>;
}

function RewardChips({ achievement }: { achievement: AchievementProgress }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm font-semibold">
      <RewardChip kind="xp">{achievement.xpBonus} XP</RewardChip>
      <RewardChip kind="coins">{achievement.coinBonus} coins</RewardChip>
    </div>
  );
}

function AchievementHeading({ achievement }: { achievement: AchievementProgress }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{achievement.title}</h3>
        <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", rarityStyles[achievement.rarity])}>
          {achievement.rarity}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/60">{achievement.description}</p>
    </>
  );
}

function AchievementFooter({
  achievement,
  history = false
}: {
  achievement: AchievementProgress;
  history?: boolean;
}) {
  const status = history
    ? achievement.unlockedAt
      ? formatDate(achievement.unlockedAt)
      : "Unlocked"
    : achievement.unlocked && achievement.unlockedAt
      ? `Unlocked ${formatDate(achievement.unlockedAt)}`
      : "Locked";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
      <RewardChips achievement={achievement} />
      <span className={clsx("text-sm font-semibold", history || achievement.unlocked ? "text-mint" : "text-ink/40")}>
        {status}
      </span>
    </div>
  );
}

function HistoryCard({ achievement }: { achievement: AchievementProgress }) {
  return (
    <article className="rounded-lg border border-mint/20 bg-mint/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <AchievementHeading achievement={achievement} />
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mint text-white">
          <Medal size={19} />
        </div>
      </div>
      <AchievementFooter achievement={achievement} history />
    </article>
  );
}

function AchievementCard({ achievement }: { achievement: AchievementProgress }) {
  return (
    <article
      className={clsx(
        "rounded-lg border p-5 transition",
        achievement.unlocked ? "border-mint/25 bg-mint/5" : "border-ink/10 bg-white"
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={clsx(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
            achievement.unlocked ? "bg-mint text-white" : "bg-ink/10 text-ink/45"
          )}
        >
          {achievement.unlocked ? <Medal size={20} /> : <LockKeyhole size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <AchievementHeading achievement={achievement} />
          <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm font-semibold text-ink/65">
            {formatCondition(achievement)}
          </p>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span className={clsx(achievement.unlocked ? "text-mint" : "text-ink/55")}>
                {formatProgress(achievement)}
              </span>
              <span className="text-ink/45">{achievement.progressPercent}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-md bg-paper">
              <div
                aria-label={`${achievement.progressPercent}% progress for ${achievement.title}`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={achievement.progressPercent}
                className={clsx("h-full rounded-md", achievement.unlocked ? "bg-mint" : "bg-violet")}
                role="progressbar"
                style={{ width: `${achievement.progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <AchievementFooter achievement={achievement} />
    </article>
  );
}

function CollectionMetric({ label, metric }: { label: string; metric: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-white/45">{label}</p>
      <p className="mt-1 text-xl font-bold">{metric}</p>
    </div>
  );
}
