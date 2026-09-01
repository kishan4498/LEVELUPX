"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CloudOff,
  Clock3,
  Coins,
  Flame,
  Gauge,
  ListChecks,
  Play,
  Plus,
  Sparkles,
  Target,
  TimerReset,
  Trophy
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { RouteFallback, SupportingText } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import {
  countOfflineActions,
  enqueueOfflineAction,
  offlineQueueChangedEvent
} from "@/lib/offlineQueue";
import { trackProductEvent } from "@/lib/productEvents";
import { useAuthStore } from "@/store/auth.store";
import type { WeeklySummary } from "@/types/analytics";
import type { AuthUser } from "@/types/auth";
import type { FocusSessionStats } from "@/types/focusSession";
import type { AppNotification } from "@/types/notification";
import type { Quest, QuestDifficulty, QuestStatus } from "@/types/quest";
import type { RewardSummary } from "@/types/reward";

const emptyWeeklySummary: WeeklySummary = {
  from: "",
  to: "",
  completedQuests: 0,
  failedQuests: 0,
  xpGained: 0,
  focusMinutes: 0,
  completionRate: 0
};

const emptyFocusStats: FocusSessionStats = {
  totalSessions: 0,
  completedSessions: 0,
  totalFocusMinutes: 0,
  averageSessionMinutes: 0
};

const emptyRewardSummary: RewardSummary = {
  level: 1,
  totalXp: 0,
  coins: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalXpEarned: 0,
  totalCoinsEarned: 0,
  totalCoinsSpent: 0
};

const difficultyWeight: Record<QuestDifficulty, number> = {
  BOSS: 5,
  HARD: 4,
  MEDIUM: 3,
  EASY: 2,
  RECOVERY: 1
};

const difficultyStyles: Record<QuestDifficulty, string> = {
  BOSS: "bg-ember/10 text-ember",
  HARD: "bg-gold/10 text-gold",
  MEDIUM: "bg-violet/10 text-violet",
  EASY: "bg-mint/10 text-mint",
  RECOVERY: "bg-sky/10 text-sky"
};

const statusStyles: Record<QuestStatus, string> = {
  PENDING: "bg-violet/10 text-violet",
  IN_PROGRESS: "bg-mint/10 text-mint",
  COMPLETED: "bg-ink text-white",
  FAILED: "bg-ember/10 text-ember",
  ARCHIVED: "bg-ink/10 text-ink/60"
};

const notificationStyles: Record<AppNotification["category"], string> = {
  GENERAL: "bg-sky/10 text-sky",
  REWARD: "bg-gold/10 text-gold",
  ACHIEVEMENT: "bg-ember/10 text-ember",
  INSIGHT: "bg-violet/10 text-violet",
  GUILD: "bg-mint/10 text-mint",
  QUEST_REMINDER: "bg-sky/10 text-sky",
  DAILY_DIGEST: "bg-gold/10 text-gold"
};

const dashboardTagClasses = {
  mission: "inline-flex items-center gap-2 rounded-md bg-mint px-2.5 py-1 text-xs font-bold text-white",
  quest: "rounded-md px-2.5 py-1 text-xs font-bold",
  queue: "rounded-md px-2 py-0.5 text-[10px] font-bold",
  unread: "rounded-md bg-ember px-2 py-1 text-xs font-bold text-white"
};

const signalIconClasses = {
  queue: "flex h-10 w-10 items-center justify-center rounded-md",
  empty: "flex h-11 w-11 items-center justify-center rounded-md",
  status: "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
  notification: "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
};

function mergeQuest(currentQuests: Quest[], newQuest: Quest) {
  return [newQuest, ...currentQuests.filter((quest) => quest.id !== newQuest.id)];
}

async function queueQuickQuest(id: string, body: Record<string, unknown>) {
  try {
    await enqueueOfflineAction({ id, kind: "CREATE_QUEST", path: "/quests", method: "POST", body });
    return null;
  } catch (err) {
    return errorMessage(err, "Could not save this quest offline.");
  }
}

const statusSignalBorders = [
  "border-b border-line sm:border-r xl:border-b-0",
  "border-b border-line xl:border-b-0 xl:border-r",
  "border-b border-line sm:border-b-0 sm:border-r",
  ""
];

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export default function DashboardPage() {
  const { accessToken, user } = useRequireAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const [weekly, setWeekly] = useState<WeeklySummary>(emptyWeeklySummary);
  const [focus, setFocus] = useState<FocusSessionStats>(emptyFocusStats);
  const [rewards, setRewards] = useState<RewardSummary>(emptyRewardSummary);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [queued, setQueued] = useState(0);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevQueued = useRef(0);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    apiRequest<{ user: AuthUser }>("/auth/me")
      .then((profileReply) => setUser(profileReply.user))
      .catch((err) => setError(errorMessage(err, "Could not refresh profile")));
  }, [accessToken, setUser]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [analytics, focusData, rewardData, questData, notificationData] = await Promise.all([
          apiRequest<{ summary: WeeklySummary }>("/analytics/weekly-summary"),
          apiRequest<{ stats: FocusSessionStats }>("/focus-sessions/stats"),
          apiRequest<{ summary: RewardSummary }>("/rewards/summary"),
          apiRequest<{ quests: Quest[] }>("/quests?limit=8"),
          apiRequest<{ notifications: AppNotification[] }>("/notifications")
        ]);

        setWeekly(analytics.summary);
        setFocus(focusData.stats);
        setRewards(rewardData.summary);
        setQuests(questData.quests);
        setNotifications(notificationData.notifications);
      } catch (err) {
        setError(errorMessage(err, "Could not load dashboard data"));
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    async function refreshQueue() {
      try {
        const count = await countOfflineActions();
        const synced = prevQueued.current > 0 && count === 0 && navigator.onLine;
        prevQueued.current = count;
        setQueued(count);

        if (synced) {
          const questList = await apiRequest<{ quests: Quest[] }>("/quests?limit=8");
          setQuests(questList.quests);
          setSyncNotice("Offline quest synced to today's queue.");
        }
      } catch {
        setQueued(0);
      }
    };

    void refreshQueue();
    window.addEventListener(offlineQueueChangedEvent, refreshQueue);
    return () => window.removeEventListener(offlineQueueChangedEvent, refreshQueue);
  }, [accessToken]);

  async function quickCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = quickTitle.trim();

    if (title.length < 3) {
      setError("Give the quest a title with at least three characters.");
      return;
    }

    const requestId = crypto.randomUUID();
    const body = {
      clientRequestId: requestId,
      title,
      difficulty: "EASY",
      category: "Quick capture",
      estimatedMinutes: 25,
      priority: "HIGH"
    };

    setQuickSaving(true);
    setError(null);
    setSyncNotice(null);

    try {
      const createdQuest = await apiRequest<{ quest: Quest }>("/quests", {
        method: "POST",
        body: JSON.stringify(body)
      });
      setQuests((current) => mergeQuest(current, createdQuest.quest));
      setQuickTitle("");
      setSyncNotice("Quest added to today's queue.");
      void trackProductEvent("quest_created", { source: "today_quick_capture", difficulty: "EASY" });
    } catch (err) {
      const isConnectionFailure = !navigator.onLine || err instanceof TypeError;

      if (!isConnectionFailure) {
        setError(errorMessage(err, "Could not create the quest."));
        return;
      }

      const offlineError = await queueQuickQuest(requestId, body);

      if (offlineError) {
        setError(offlineError);
        return;
      }

      setQuickTitle("");
      setSyncNotice("Quest saved on this device. It will sync when the connection returns.");
    } finally {
      setQuickSaving(false);
    }
  }

  if (!accessToken || !user) {
    return <RouteFallback />;
  }

  const activeQuests = quests
    .filter((quest) => quest.status === "PENDING" || quest.status === "IN_PROGRESS")
    .sort(compareQuestPriority);
  const primaryQuest = activeQuests[0] ?? null;
  const primaryDue = getDueState(primaryQuest?.dueDate ?? null);
  const unread = notifications.filter((notification) => !notification.readAt);
  const overdue = activeQuests.filter((quest) => getDueState(quest.dueDate).isOverdue);
  const completion = Math.min(100, Math.max(0, Math.round(weekly.completionRate)));

  const statusSignals: StatusSignal[] = [
    {
      label: "Active quests",
      value: String(activeQuests.length),
      detail: overdue.length > 0 ? `${overdue.length} need attention` : "Queue is under control",
      icon: ListChecks,
      tone: "text-violet bg-violet/10"
    },
    {
      label: "Completed",
      value: String(weekly.completedQuests),
      detail: "This week",
      icon: CheckCircle2,
      tone: "text-mint bg-mint/10"
    },
    {
      label: "Focus record",
      value: `${focus.totalFocusMinutes}m`,
      detail: `${focus.completedSessions} sessions finished`,
      icon: TimerReset,
      tone: "text-sky bg-sky/10"
    },
    {
      label: "Current streak",
      value: `${rewards.currentStreak}d`,
      detail: `Best run ${rewards.longestStreak} days`,
      icon: Flame,
      tone: "text-ember bg-ember/10"
    }
  ];

  return (
    <AppShell eyebrow="Today" title={`Welcome back, ${firstName(user.name)}`}>
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-md border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="mb-5 rounded-md border border-line bg-white p-4 shadow-panel">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={quickCapture}>
          <label className="min-w-0 flex-1 text-sm font-bold" htmlFor="quick-quest">
            Quick capture
            <input
              className="lx-field mt-2 h-11 w-full rounded-md border border-line bg-paper px-3 text-sm outline-none placeholder:text-ink/35 focus:border-sky focus:ring-2 focus:ring-sky/15"
              id="quick-quest"
              maxLength={100}
              onChange={(event) => setQuickTitle(event.target.value)}
              placeholder="What needs to get done?"
              value={quickTitle}
            />
          </label>
          <button
            className="lx-button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-mint bg-mint px-4 text-sm font-bold text-white shadow-action hover:bg-mint/90 disabled:opacity-55"
            disabled={quickSaving}
            type="submit"
          >
            <Plus size={17} />
            {quickSaving ? "Saving..." : "Add quest"}
          </button>
          {queued > 0 && (
            <Link
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-3 text-sm font-bold text-gold"
              href="/offline"
            >
              <CloudOff size={16} />
              {queued} queued
            </Link>
          )}
        </form>
        {syncNotice && <p className="mt-3 text-xs font-semibold text-mint">{syncNotice}</p>}
      </section>

      <section className="overflow-hidden rounded-md border border-ink bg-ink text-white shadow-command">
        <div className="grid min-h-[240px] lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col justify-between p-5 sm:p-7">
            <div>
              <MissionHeader quest={primaryQuest} />

              <MissionCopy loading={loading} quest={primaryQuest} />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="lx-button inline-flex h-11 items-center gap-2 rounded-md border border-mint bg-mint px-4 text-sm font-bold text-white shadow-action hover:bg-mint/90"
                href={primaryQuest ? `/focus?quest=${primaryQuest.id}` : "/quests"}
              >
                {primaryQuest ? <Play size={17} /> : <Plus size={17} />}
                {primaryQuest ? "Enter focus" : "Create a quest"}
              </Link>
              <Link
                className="lx-button inline-flex h-11 items-center gap-2 rounded-md border border-white/15 px-4 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white"
                href="/quests"
              >
                Open quest log
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/5 p-5 lg:border-l lg:border-t-0 lg:p-6">
            <p className="text-xs font-bold uppercase text-white/45">Mission readout</p>
            {primaryQuest ? (
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-1">
                <MissionDetail detail={`${primaryQuest.estimatedMinutes} minutes`} icon={Clock3} label="Time box" />
                <MissionDetail detail={`${primaryQuest.xpReward} XP`} icon={Trophy} label="XP reward" />
                <MissionDetail detail={`${primaryQuest.coinReward} coins`} icon={Coins} label="Coin reward" />
                <MissionDetail
                  icon={CalendarDays}
                  label="Deadline"
                  detail={primaryDue.label}
                  warning={primaryDue.isOverdue}
                />
              </dl>
            ) : (
              <div className="mt-5">
                <Gauge className="text-mint" size={24} />
                <p className="mt-4 text-sm font-bold">Ready for a fresh objective</p>
                <p className="mt-2 text-xs leading-5 text-white/45">
                  A short, clearly-scoped quest is the fastest way to begin a new run.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-md border border-line bg-white shadow-panel" aria-label="Current status">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {statusSignals.map((signal, index) => (
            <StatusSignalCard index={index} key={signal.label} loading={loading} signal={signal} />
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-violet">
                <ListChecks size={17} />
                <span>Quest queue</span>
              </div>
              <h2 className="mt-1 text-xl font-bold">Keep momentum moving</h2>
              <SupportingText spaced>
                {loading ? "Prioritizing your active quests..." : `${activeQuests.length} active quests ordered by urgency`}
              </SupportingText>
            </div>
            <Link className="inline-flex items-center gap-2 text-sm font-bold text-violet hover:text-violet/80" href="/quests">
              Manage quests
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="overflow-hidden rounded-md border border-line bg-white shadow-panel">
            {loading && (
              <div className="flex min-h-[104px] items-center gap-3 p-5 text-sm font-semibold text-ink/55">
                <SignalIcon tone="bg-violet/10 text-violet" variant="queue">
                  <Sparkles size={18} />
                </SignalIcon>
                Building a focused queue from your current quests...
              </div>
            )}

            {!loading &&
              activeQuests.slice(0, 5).map((quest, index) => (
                <QuestQueueItem index={index} key={quest.id} quest={quest} />
              ))}

            {!loading && activeQuests.length === 0 && (
              <div className="flex min-h-[180px] flex-col items-start justify-center p-6">
                <SignalIcon tone="bg-mint/10 text-mint" variant="empty">
                  <CheckCircle2 size={21} />
                </SignalIcon>
                <h3 className="mt-4 font-bold">No active quests</h3>
                <p className="mt-1 max-w-md text-sm leading-6 text-ink/55">
                  Your queue is clear. Add one concrete objective to give the next focus session a target.
                </p>
                <PanelLink href="/quests" label="Create next quest" />
              </div>
            )}
          </div>
        </div>

        <aside className="grid content-start gap-5">
          <WeeklyBriefing completion={completion} focus={focus} loading={loading} weekly={weekly} />
          <RecentSignals loading={loading} notifications={unread} />
        </aside>
      </section>
    </AppShell>
  );
}

function MissionTags({ quest }: { quest: Quest }) {
  return (
    <>
      <DashboardTag tone={statusStyles[quest.status]} variant="quest">
        {formatLabel(quest.status)}
      </DashboardTag>
      <DashboardTag tone={difficultyStyles[quest.difficulty]} variant="quest">
        {formatLabel(quest.difficulty)}
      </DashboardTag>
    </>
  );
}

function MissionHeader({ quest }: { quest: Quest | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DashboardTag variant="mission">
        <Target size={14} />
        Next mission
      </DashboardTag>
      {quest && <MissionTags quest={quest} />}
    </div>
  );
}

function DashboardTag({
  children,
  tone,
  variant
}: {
  children: ReactNode;
  tone?: string;
  variant: keyof typeof dashboardTagClasses;
}) {
  return <span className={clsx(dashboardTagClasses[variant], tone)}>{children}</span>;
}

function SignalIcon({
  children,
  tone,
  variant
}: {
  children: ReactNode;
  tone: string;
  variant: keyof typeof signalIconClasses;
}) {
  return <span className={clsx(signalIconClasses[variant], tone)}>{children}</span>;
}

function DashboardPanel({
  children,
  eyebrow,
  icon: Icon,
  title,
  tone,
  trailing
}: {
  children: ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  tone: string;
  trailing?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={clsx("flex items-center gap-2 text-sm font-bold", tone)}>
            <Icon size={17} />
            <span>{eyebrow}</span>
          </div>
          <h2 className="mt-1 text-lg font-bold">{title}</h2>
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}

function WeeklyBriefing({
  completion,
  focus,
  loading,
  weekly
}: {
  completion: number;
  focus: FocusSessionStats;
  loading: boolean;
  weekly: WeeklySummary;
}) {
  return (
    <DashboardPanel
      eyebrow="Weekly briefing"
      icon={Gauge}
      title="Momentum score"
      tone="text-mint"
      trailing={<span className="text-2xl font-bold">{loading ? "--" : `${completion}%`}</span>}
    >
      <div className="mt-5 h-2 overflow-hidden rounded-md bg-line">
        <div
          aria-label={`${completion}% weekly quest completion rate`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={completion}
          className="lx-progress-fill h-full rounded-md bg-mint"
          role="progressbar"
          style={{ width: `${completion}%` }}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-ink/55">{momentumCopy(completion)}</p>
      <dl className="mt-5 divide-y divide-line border-y border-line">
        <BriefingRow detail={`${weekly.xpGained} XP`} label="XP gained" />
        <BriefingRow detail={`${weekly.focusMinutes} min`} label="Focus recorded" />
        <BriefingRow detail={`${Math.round(focus.averageSessionMinutes)} min`} label="Average session" />
        <BriefingRow detail={String(weekly.failedQuests)} label="Failed quests" warning={weekly.failedQuests > 0} />
      </dl>
      <PanelLink href="/analytics" label="Open analytics" />
    </DashboardPanel>
  );
}

function RecentSignals({ loading, notifications }: { loading: boolean; notifications: AppNotification[] }) {
  const badge = notifications.length > 0
    ? <DashboardTag variant="unread">{notifications.length} new</DashboardTag>
    : undefined;

  return (
    <DashboardPanel eyebrow="Recent signals" icon={Bell} title="What changed" tone="text-sky" trailing={badge}>
      <div className="mt-4 divide-y divide-line border-y border-line">
        {notifications.slice(0, 3).map((notification) => (
          <NotificationSignal key={notification.id} notification={notification} />
        ))}
        {!loading && notifications.length === 0 && (
          <div className="py-4">
            <p className="text-sm font-bold">You are all caught up</p>
            <p className="mt-1 text-xs leading-5 text-ink/45">New rewards, insights, and guild activity will appear here.</p>
          </div>
        )}
        {loading && <p className="py-4 text-sm text-ink/45">Checking recent activity...</p>}
      </div>
      <PanelLink href="/notifications" label="Open notifications" />
    </DashboardPanel>
  );
}

function momentumCopy(completion: number) {
  if (completion >= 75) {
    return "Strong run. Protect the rhythm and finish cleanly.";
  }

  if (completion >= 40) {
    return "Momentum is building. One focused completion can shift the week.";
  }

  return "Start small. A single finished quest is enough to restart momentum.";
}

type StatusSignal = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
};

function MissionCopy({ loading, quest }: { loading: boolean; quest: Quest | null }) {
  return (
    <div className="mt-6 min-h-[92px]">
      {loading ? (
        <>
          <p className="text-xl font-bold">Building your mission queue...</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
            Pulling your latest quests, focus stats, and weekly progress.
          </p>
        </>
      ) : quest ? (
        <>
          <h2 className="max-w-2xl text-2xl font-bold leading-tight sm:text-3xl">{quest.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            {quest.description || "This quest is the strongest next move in your active queue."}
          </p>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl">Your quest board is clear</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/60">
            Capture the next meaningful task, then use a focus session to turn it into progress.
          </p>
        </>
      )}
    </div>
  );
}

function StatusSignalCard({ index, loading, signal }: { index: number; loading: boolean; signal: StatusSignal }) {
  const Icon = signal.icon;

  return (
    <div className={clsx("flex min-h-[112px] items-center gap-3 p-4", statusSignalBorders[index])}>
      <SignalIcon tone={signal.tone} variant="status">
        <Icon size={19} />
      </SignalIcon>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-ink/45">{signal.label}</span>
        <span className="mt-0.5 block text-2xl font-bold">{loading ? "--" : signal.value}</span>
        <span className="mt-0.5 block truncate text-xs text-ink/45">{signal.detail}</span>
      </span>
    </div>
  );
}

function QuestQueueItem({ index, quest }: { index: number; quest: Quest }) {
  const dueState = getDueState(quest.dueDate);

  return (
    <Link
      className="lx-interactive group grid min-h-[104px] gap-4 border-b border-line p-4 last:border-b-0 hover:bg-paper sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:items-center"
      href="/quests"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-paper text-sm font-bold text-ink/45 group-hover:border-mint group-hover:bg-mint/10 group-hover:text-mint">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-bold">{quest.title}</span>
          <DashboardTag tone={difficultyStyles[quest.difficulty]} variant="queue">
            {formatLabel(quest.difficulty)}
          </DashboardTag>
        </span>
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink/45">
          <span>{quest.category}</span>
          <span>{quest.estimatedMinutes} min</span>
          <span className={clsx(dueState.isOverdue && "text-ember")}>{dueState.label}</span>
        </span>
      </span>
      <span className="flex items-center justify-between gap-4 sm:justify-end">
        <span className="text-right">
          <span className="block text-sm font-bold text-violet">+{quest.xpReward} XP</span>
          <span className="mt-0.5 block text-xs font-semibold text-gold">+{quest.coinReward} coins</span>
        </span>
        <ChevronRight className="text-ink/35 group-hover:text-mint" size={18} />
      </span>
    </Link>
  );
}

function NotificationSignal({ notification }: { notification: AppNotification }) {
  return (
    <Link className="group flex gap-3 py-3" href="/notifications">
      <SignalIcon tone={notificationStyles[notification.category]} variant="notification">
        <Sparkles size={14} />
      </SignalIcon>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold group-hover:text-violet">{notification.title}</span>
        <span className="mt-1 block truncate text-xs text-ink/45">{notification.message}</span>
      </span>
    </Link>
  );
}

function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-violet" href={href}>
      {label}
      <ArrowRight size={16} />
    </Link>
  );
}

function MissionDetail({
  icon: Icon,
  label,
  detail,
  warning = false
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className={clsx("mt-0.5", warning ? "text-ember" : "text-mint")} size={16} />
      <div>
        <dt className="text-[10px] font-bold uppercase text-white/45">{label}</dt>
        <dd className={clsx("mt-0.5 text-sm font-bold", warning ? "text-ember" : "text-white")}>{detail}</dd>
      </div>
    </div>
  );
}

function BriefingRow({ detail, label, warning = false }: { detail: string; label: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <dt className="text-ink/55">{label}</dt>
      <dd className={clsx("font-bold", warning ? "text-ember" : "text-ink")}>{detail}</dd>
    </div>
  );
}

function compareQuestPriority(left: Quest, right: Quest) {
  if (left.status !== right.status) {
    return left.status === "IN_PROGRESS" ? -1 : 1;
  }

  const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;

  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  return difficultyWeight[right.difficulty] - difficultyWeight[left.difficulty];
}

function getDueState(deadline: string | null) {
  if (!deadline) {
    return { label: "No deadline", isOverdue: false };
  }

  const dueDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  if (Number.isNaN(dueDate.getTime())) {
    return { label: "Deadline unavailable", isOverdue: false };
  }

  const daysAway = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);

  if (daysAway < 0) {
    return { label: `${Math.abs(daysAway)}d overdue`, isOverdue: true };
  }

  if (daysAway === 0) {
    return { label: "Due today", isOverdue: false };
  }

  if (daysAway === 1) {
    return { label: "Due tomorrow", isOverdue: false };
  }

  return {
    label: shortDate.format(dueDate),
    isOverdue: false
  };
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Player";
}

function formatLabel(label: string) {
  return label
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
