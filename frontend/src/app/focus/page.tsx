"use client";

import { clsx } from "clsx";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Coffee,
  Flame,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  StickyNote,
  Square,
  Target,
  TimerReset,
  Trophy,
  Volume2,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RouteFallback } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import { trackProductEvent } from "@/lib/productEvents";
import type { FocusSession, FocusSessionStats, FocusSessionType } from "@/types/focusSession";
import type { Quest } from "@/types/quest";

type SessionOption = {
  value: FocusSessionType;
  label: string;
  minutes: number;
  description: string;
  icon: LucideIcon;
  tone: string;
};

const sessionTypes: SessionOption[] = [
  {
    value: "POMODORO",
    label: "Pomodoro",
    minutes: 25,
    description: "A steady block for one clear objective.",
    icon: TimerReset,
    tone: "text-mint bg-mint/10"
  },
  {
    value: "DEEP_WORK",
    label: "Deep work",
    minutes: 60,
    description: "Protected time for demanding progress.",
    icon: Zap,
    tone: "text-violet bg-violet/10"
  },
  {
    value: "SHORT_BREAK",
    label: "Short break",
    minutes: 5,
    description: "Step away briefly and reset attention.",
    icon: Coffee,
    tone: "text-sky bg-sky/10"
  },
  {
    value: "LONG_BREAK",
    label: "Long break",
    minutes: 15,
    description: "Recover before beginning another run.",
    icon: Flame,
    tone: "text-gold bg-gold/10"
  }
];

const emptyStats: FocusSessionStats = {
  totalSessions: 0,
  completedSessions: 0,
  totalFocusMinutes: 0,
  averageSessionMinutes: 0
};

const focusIconClasses = {
  selected: "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
  option: "flex h-8 w-8 items-center justify-center rounded-md",
  empty: "flex h-11 w-11 items-center justify-center rounded-md",
  history: "flex h-10 w-10 items-center justify-center rounded-md",
  signal: "flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
};

const focusBadgeClasses = {
  active: "inline-flex items-center gap-2 rounded-md bg-mint px-2.5 py-1 text-xs font-bold text-white",
  mode: "rounded-md px-2.5 py-1 text-xs font-bold",
  status: "rounded-md px-2 py-0.5 text-[10px] font-bold"
};

const focusTitleClasses = {
  lg: "mt-1 text-lg font-bold",
  xl: "mt-1 text-xl font-bold"
};

const sessionDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export default function FocusPage() {
  const { accessToken } = useRequireAuth();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [stats, setStats] = useState<FocusSessionStats>(emptyStats);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [questId, setQuestId] = useState("");
  const [sessionType, setSessionType] = useState<FocusSessionType>("POMODORO");
  const [minutes, setMinutes] = useState(25);
  const [goal, setGoal] = useState("");
  const [note, setNote] = useState("");
  const [alerts, setAlerts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const linkApplied = useRef(false);
  const alertedId = useRef<string | null>(null);

  const activeSession = sessions.find((session) => !session.endTime) ?? null;
  const activeQuests = quests.filter((quest) => quest.status === "PENDING" || quest.status === "IN_PROGRESS");
  const selectedType = getSessionType(sessionType);
  const activeType = activeSession ? getSessionType(activeSession.sessionType) : null;
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const timer = activeSession && activeType ? buildTimer(activeSession, activeType, now) : null;

  const loadFocusData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [historyData, statsData, questData] = await Promise.all([
        apiRequest<{ sessions: FocusSession[] }>("/focus-sessions/history"),
        apiRequest<{ stats: FocusSessionStats }>("/focus-sessions/stats"),
        apiRequest<{ quests: Quest[] }>("/quests?limit=50")
      ]);

      setSessions(historyData.sessions);
      setStats(statsData.stats);
      setQuests(questData.quests);
    } catch (err) {
      setError(errorMessage(err, "Could not load focus data"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadFocusData();
  }, [loadFocusData]);

  useEffect(() => {
    setNote(activeSession?.distractionNote ?? "");
  }, [activeSession?.distractionNote, activeSession?.id]);

  useEffect(() => {
    if (!activeSession || activeSession.pausedAt) {
      return;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    if (linkApplied.current || loading) {
      return;
    }

    linkApplied.current = true;
    const searchParams = new URLSearchParams(window.location.search);
    const linkedQuestId = searchParams.get("questId") ?? searchParams.get("quest");
    const linkedMinutes = Number(searchParams.get("minutes"));

    if (linkedQuestId && quests.some((quest) => quest.id === linkedQuestId)) {
      setQuestId(linkedQuestId);
    }

    if (Number.isInteger(linkedMinutes) && linkedMinutes >= 5 && linkedMinutes <= 240) {
      setMinutes(linkedMinutes);
    }
  }, [loading, quests]);

  useEffect(() => {
    if (
      !alerts ||
      !activeSession ||
      activeSession.pausedAt ||
      !timer?.isOvertime ||
      alertedId.current === activeSession.id
    ) {
      return;
    }

    alertedId.current = activeSession.id;
    playCompletionTone();

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Focus target reached", {
        body: activeSession.goal || "Your planned focus block is complete."
      });
    }
  }, [activeSession, alerts, timer?.isOvertime]);

  async function startSession() {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (alerts && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }

      await apiRequest<{ session: FocusSession }>("/focus-sessions/start", {
        method: "POST",
        body: JSON.stringify({
          sessionType,
          questId: questId || undefined,
          targetMinutes: minutes,
          goal: goal.trim() || undefined
        })
      });

      setNotice(`${selectedType.label} run started. The clock now follows the server session.`);
      void trackProductEvent("focus_started", {
        sessionType,
        targetMinutes: minutes,
        linkedQuest: Boolean(questId)
      });
      await loadFocusData();
    } catch (err) {
      setError(errorMessage(err, "Could not start focus session"));
    } finally {
      setSaving(false);
    }
  }

  async function stopSession(completed: boolean) {
    if (!activeSession) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await apiRequest<{ session: FocusSession }>(`/focus-sessions/${activeSession.id}/stop`, {
        method: "POST",
        body: JSON.stringify({
          completed,
          distractionNote: note.trim() || undefined
        })
      });

      setNotice(completed ? "Focus run completed and added to your record." : "Focus run stopped without marking it complete.");
      if (completed) {
        void trackProductEvent("focus_completed", {
          sessionType: activeSession.sessionType,
          targetMinutes: activeSession.targetMinutes ?? activeType?.minutes ?? 0
        });
      }
      setNote("");
      await loadFocusData();
    } catch (err) {
      setError(errorMessage(err, "Could not stop focus session"));
    } finally {
      setSaving(false);
    }
  }

  async function togglePause() {
    if (!activeSession) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiRequest<{ session: FocusSession }>(
        "/focus-sessions/" + activeSession.id + (activeSession.pausedAt ? "/resume" : "/pause"),
        { method: "POST" }
      );
      await loadFocusData();
    } catch (err) {
      setError(errorMessage(err, "Could not update the focus timer"));
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if (!activeSession) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiRequest("/focus-sessions/" + activeSession.id + "/note", {
        method: "PATCH",
        body: JSON.stringify({ distractionNote: note })
      });
      setNotice("Focus note saved.");
      await loadFocusData();
    } catch (err) {
      setError(errorMessage(err, "Could not save focus note"));
    } finally {
      setSaving(false);
    }
  }

  if (!accessToken) {
    return <RouteFallback />;
  }

  const completionRate = stats.totalSessions > 0 ? Math.round((stats.completedSessions / stats.totalSessions) * 100) : 0;
  const selected = questId ? questById.get(questId) : null;

  return (
    <AppShell eyebrow="Focus Arena" title="Focus sessions">
      {error && <FeedbackBanner icon={AlertCircle} message={error} tone="border-ember/20 bg-ember/10 text-ember" />}
      {notice && <FeedbackBanner icon={CheckCircle2} message={notice} tone="border-mint/20 bg-mint/10 text-mint" />}

      {activeSession && activeType && timer ? (
        <ActiveFocusRun
          activeSession={activeSession}
          activeType={activeType}
          note={note}
          onNoteChange={setNote}
          onSaveNote={saveNote}
          onStop={stopSession}
          onTogglePause={togglePause}
          questById={questById}
          saving={saving}
          timer={timer}
        />
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-md border border-line bg-white p-5 shadow-panel sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <FocusSectionHeading
                description="Pick one mode and, when useful, attach a single quest."
                eyebrow="Prepare a focus run"
                icon={Play}
                roomy
                title="Choose the shape of this block"
                titleSize="xl"
                tone="text-mint"
              />
              <FocusIcon tone={selectedType.tone} variant="selected">
                <selectedType.icon size={19} />
              </FocusIcon>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {sessionTypes.map((sessionOption) => {
                const Icon = sessionOption.icon;
                const selected = sessionType === sessionOption.value;

                return (
                  <button
                    aria-pressed={selected}
                    className={clsx(
                      "lx-interactive min-h-[116px] rounded-md border p-4 text-left",
                      selected ? "border-ink bg-ink text-white shadow-action" : "border-line bg-white text-ink hover:border-violet/40"
                    )}
                    disabled={saving}
                    key={sessionOption.value}
                    onClick={() => {
                      setSessionType(sessionOption.value);
                      setMinutes(sessionOption.minutes);
                    }}
                    type="button"
                  >
                    <FocusIcon tone={selected ? "bg-white/10 text-white" : sessionOption.tone} variant="option">
                      <Icon size={16} />
                    </FocusIcon>
                    <span className="mt-3 flex items-center justify-between gap-3">
                      <span className="font-bold">{sessionOption.label}</span>
                      <span className={clsx("text-xs font-bold", selected ? "text-mint" : "text-ink/45")}>{sessionOption.minutes}m</span>
                    </span>
                    <span className={clsx("mt-1 block text-xs leading-5", selected ? "text-white/55" : "text-ink/45")}>{sessionOption.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="rounded-md border border-line bg-white p-5 shadow-panel">
            <FocusSectionHeading
              bare
              description="Optional, but useful when this block should move a specific objective."
              eyebrow="Run target"
              icon={Target}
              roomy
              title="Link a quest"
              titleSize="lg"
              tone="text-violet"
            />

            <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="questId">
              Active quest
            </label>
            <select
              className="lx-field mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/15"
              disabled={saving}
              id="questId"
              onChange={(event) => setQuestId(event.target.value)}
              value={questId}
            >
              <option value="">Open focus / no quest</option>
              {activeQuests.map((quest) => (
                <option key={quest.id} value={quest.id}>
                  {quest.title}
                </option>
              ))}
            </select>

            <div className="mt-4 grid gap-4">
              <Input
                label="Run goal"
                maxLength={160}
                name="focusGoal"
                placeholder="What will be true when this block ends?"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
              <Input
                label="Target minutes"
                max={240}
                min={5}
                name="targetMinutes"
                type="number"
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
              <label className="flex min-h-11 items-center justify-between gap-3 border-y border-line py-3 text-sm font-semibold">
                <span className="inline-flex items-center gap-2"><Volume2 className="text-sky" size={16} /> Completion alert</span>
                <input
                  checked={alerts}
                  className="h-4 w-4 accent-mint"
                  name="completionAlert"
                  onChange={(event) => setAlerts(event.target.checked)}
                  type="checkbox"
                />
              </label>
            </div>

            <div className="mt-5 rounded-md border border-line bg-paper p-4">
              <p className="text-[10px] font-bold uppercase text-ink/45">Ready check</p>
              <p className="mt-2 font-bold">{selected?.title ?? `${selectedType.label} focus`}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-ink/45">
                <span className="inline-flex items-center gap-1"><Clock3 size={13} /> {minutes} min</span>
                {selected && <span className="inline-flex items-center gap-1 text-violet"><Sparkles size={13} /> {selected.xpReward} quest XP</span>}
              </div>
            </div>

            <Button
              className="mt-5 w-full"
              disabled={saving || loading || !Number.isFinite(minutes) || minutes < 5 || minutes > 240}
              onClick={() => void startSession()}
              type="button"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
              Start {minutes}m {selectedType.label}
            </Button>
            {activeQuests.length === 0 && (
              <Link className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-violet" href="/quests">
                Create a quest first
                <ArrowRight size={15} />
              </Link>
            )}
          </aside>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-md border border-line bg-white shadow-panel">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <FocusSignal borderClass="border-b border-line sm:border-r xl:border-b-0" detail="All recorded runs" icon={TimerReset} label="Total sessions" metric={stats.totalSessions} />
          <FocusSignal borderClass="border-b border-line xl:border-b-0 xl:border-r" detail={`${stats.completedSessions} completed`} icon={CheckCircle2} label="Completion rate" metric={`${completionRate}%`} />
          <FocusSignal borderClass="border-b border-line sm:border-b-0 sm:border-r" detail="Total focused minutes" icon={Clock3} label="Focus record" metric={`${stats.totalFocusMinutes}m`} />
          <FocusSignal detail="Across finished sessions" icon={Trophy} label="Average run" metric={`${Math.round(stats.averageSessionMinutes)}m`} />
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <FocusSectionHeading
            description="A calm record of what you protected time for."
            eyebrow="Run history"
            icon={Clock3}
            title="Recent focus record"
            titleSize="xl"
            tone="text-sky"
          />
          <Button disabled={loading} onClick={() => void loadFocusData()} variant="ghost">
            <RotateCcw className={clsx(loading && "animate-spin")} size={17} />
            Refresh
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border border-line bg-white shadow-panel">
          {loading ? (
            <div className="flex min-h-[112px] items-center gap-3 p-5 text-sm font-semibold text-ink/55">
              <Loader2 className="animate-spin text-violet" size={19} />
              Syncing focus history...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-start justify-center p-6">
              <FocusIcon tone="bg-mint/10 text-mint" variant="empty"><TimerReset size={21} /></FocusIcon>
              <h3 className="mt-4 font-bold">No focus record yet</h3>
              <p className="mt-1 max-w-lg text-sm leading-6 text-ink/55">Choose a short run above. Finishing one honest block is enough to begin the record.</p>
            </div>
          ) : (
            sessions.slice(0, 8).map((session) => {
              const mode = getSessionType(session.sessionType);
              const ModeIcon = mode.icon;

              return (
                <article className="grid gap-4 border-b border-line p-4 last:border-b-0 sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:items-center" key={session.id}>
                  <FocusIcon tone={mode.tone} variant="history"><ModeIcon size={18} /></FocusIcon>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{mode.label}</h3>
                      <SessionStatus session={session} />
                    </div>
                    <p className="mt-1 truncate text-sm text-ink/55">
                      {session.questId ? questById.get(session.questId)?.title ?? "Linked quest" : "Open focus"} / {formatDate(session.startTime)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-bold">{session.durationMinutes ? `${session.durationMinutes} min` : "In progress"}</p>
                    <p className="mt-1 text-xs font-semibold text-ink/45">Target {session.targetMinutes ?? mode.minutes} min</p>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </AppShell>
  );
}

function FocusSectionHeading({
  bare = false,
  description,
  eyebrow,
  icon: Icon,
  roomy = false,
  title,
  titleSize,
  tone
}: {
  bare?: boolean;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  roomy?: boolean;
  title: string;
  titleSize: keyof typeof focusTitleClasses;
  tone: string;
}) {
  const heading = (
    <>
      <div className={clsx("flex items-center gap-2 text-sm font-bold", tone)}>
        <Icon size={16} />
        <span>{eyebrow}</span>
      </div>
      <h2 className={focusTitleClasses[titleSize]}>{title}</h2>
      <p className={clsx("mt-1 text-sm", roomy && "leading-6", "text-ink/55")}>{description}</p>
    </>
  );

  if (bare) {
    return heading;
  }

  return <div>{heading}</div>;
}

function FocusIcon({
  children,
  tone,
  variant
}: {
  children: ReactNode;
  tone: string;
  variant: keyof typeof focusIconClasses;
}) {
  return <span className={clsx(focusIconClasses[variant], tone)}>{children}</span>;
}

function FocusBadge({
  children,
  tone,
  variant
}: {
  children: ReactNode;
  tone?: string;
  variant: keyof typeof focusBadgeClasses;
}) {
  return <span className={clsx(focusBadgeClasses[variant], tone)}>{children}</span>;
}

function ActiveFocusRun({
  activeSession,
  activeType,
  note,
  onNoteChange,
  onSaveNote,
  onStop,
  onTogglePause,
  questById,
  saving,
  timer
}: {
  activeSession: FocusSession;
  activeType: SessionOption;
  note: string;
  onNoteChange: (note: string) => void;
  onSaveNote: () => Promise<void>;
  onStop: (completed: boolean) => Promise<void>;
  onTogglePause: () => Promise<void>;
  questById: Map<string, Quest>;
  saving: boolean;
  timer: ReturnType<typeof buildTimer>;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-ink bg-ink text-white shadow-command">
      <div className="grid min-h-[330px] lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col justify-between p-6 sm:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FocusBadge variant="active">
                <Zap size={14} />
                {activeSession.pausedAt ? "Focus run paused" : "Focus run active"}
              </FocusBadge>
              <FocusBadge tone={activeType.tone} variant="mode">
                {activeType.label}
              </FocusBadge>
            </div>

            <p className="mt-7 text-xs font-bold uppercase text-white/45">{timer.isOvertime ? "Overtime" : "Time remaining"}</p>
            <p className={clsx("mt-2 text-6xl font-bold leading-none sm:text-7xl", timer.isOvertime ? "text-ember" : "text-white")}>
              {formatCountdown(timer.remainingSeconds)}
            </p>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/55">
              {activeSession.goal ||
                (activeSession.questId
                  ? `Protect this block for: ${questById.get(activeSession.questId)?.title ?? "linked quest"}.`
                  : "Stay with one meaningful outcome until this block is complete.")}
            </p>
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/45">
              <span>{formatCountdown(timer.elapsedSeconds)} elapsed</span>
              <span>{timer.progressPercent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-md bg-white/10">
              <div
                aria-label={`${timer.progressPercent}% of focus block complete`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={timer.progressPercent}
                className={clsx("lx-progress-fill h-full rounded-md", timer.isOvertime ? "bg-ember" : "bg-mint")}
                role="progressbar"
                style={{ width: `${timer.progressPercent}%` }}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={saving} onClick={() => void onTogglePause()} type="button" variant="secondary">
                {activeSession.pausedAt ? <Play size={18} /> : <Pause size={18} />}
                {activeSession.pausedAt ? "Resume" : "Pause"}
              </Button>
              <Button disabled={saving} onClick={() => void onStop(true)} type="button" variant="secondary">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                Complete run
              </Button>
              <Button
                className="border-white/15 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white"
                disabled={saving}
                onClick={() => void onStop(false)}
                type="button"
                variant="ghost"
              >
                <Square size={18} />
                Stop early
              </Button>
            </div>
          </div>
        </div>

        <aside className="border-t border-white/10 bg-white/5 p-6 lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase text-white/45">Run details</p>
          <dl className="mt-5 divide-y divide-white/10 border-y border-white/10">
            <ActiveDetail detail={activeType.label} label="Mode" />
            <ActiveDetail detail={(activeSession.targetMinutes ?? activeType.minutes) + " minutes"} label="Target" />
            <ActiveDetail detail={formatDate(activeSession.startTime)} label="Started" />
            <ActiveDetail detail={activeSession.questId ? questById.get(activeSession.questId)?.title ?? "Linked quest" : "Open focus"} label="Linked quest" />
            <ActiveDetail detail={activeSession.goal ?? "One clear outcome"} label="Goal" />
          </dl>
          <label className="mt-5 grid gap-2 text-xs font-bold text-white/70">
            <span className="inline-flex items-center gap-2"><StickyNote size={14} /> Distraction note</span>
            <textarea
              className="min-h-20 resize-y rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-normal text-white outline-none placeholder:text-white/30 focus:border-mint"
              maxLength={500}
              placeholder="Capture it, then return to the task"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
          <Button
            className="mt-3 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
            disabled={saving}
            onClick={() => void onSaveNote()}
            type="button"
            variant="ghost"
          >
            Save note
          </Button>
          <p className="mt-5 text-xs leading-5 text-white/45">
            {timer.isOvertime
              ? "Target time reached. Complete when the work is honestly finished."
              : "The timer survives refreshes because the active run is stored by the server."}
          </p>
        </aside>
      </div>
    </section>
  );
}

function FeedbackBanner({ icon: Icon, message, tone }: { icon: LucideIcon; message: string; tone: string }) {
  return (
    <div className={clsx("mb-5 flex items-start gap-3 rounded-md border px-4 py-3 text-sm font-semibold", tone)}>
      <Icon className="mt-0.5 shrink-0" size={17} />
      <span>{message}</span>
    </div>
  );
}

function ActiveDetail({ detail, label }: { detail: string; label: string }) {
  return (
    <div className="py-3">
      <dt className="text-[10px] font-bold uppercase text-white/45">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-white">{detail}</dd>
    </div>
  );
}

function FocusSignal({
  icon: Icon,
  label,
  metric,
  detail,
  borderClass = ""
}: {
  icon: LucideIcon;
  label: string;
  metric: string | number;
  detail: string;
  borderClass?: string;
}) {
  return (
    <div className={clsx("flex min-h-[104px] items-center gap-3 p-4", borderClass)}>
      <FocusIcon tone="bg-sky/10 text-sky" variant="signal"><Icon size={19} /></FocusIcon>
      <span>
        <span className="block text-xs font-bold text-ink/45">{label}</span>
        <span className="mt-0.5 block text-2xl font-bold">{metric}</span>
        <span className="block text-xs text-ink/45">{detail}</span>
      </span>
    </div>
  );
}

function SessionStatus({ session }: { session: FocusSession }) {
  if (!session.endTime) {
    return (
      <FocusBadge tone="bg-mint/10 text-mint" variant="status">
        {session.pausedAt ? "Paused" : "Active"}
      </FocusBadge>
    );
  }

  return session.completed ? (
    <FocusBadge tone="bg-ink text-white" variant="status">Completed</FocusBadge>
  ) : (
    <FocusBadge tone="bg-ember/10 text-ember" variant="status">Stopped</FocusBadge>
  );
}

function formatDate(timestamp: string) {
  return sessionDate.format(new Date(timestamp));
}

function getSessionType(type: FocusSessionType) {
  return sessionTypes.find((sessionOption) => sessionOption.value === type) ?? sessionTypes[0];
}

function buildTimer(session: FocusSession, type: SessionOption, now: number) {
  const targetSeconds = (session.targetMinutes ?? type.minutes) * 60;
  const timerNow = session.pausedAt ? new Date(session.pausedAt).getTime() : now;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((timerNow - new Date(session.startTime).getTime()) / 1000) - session.pausedSeconds
  );
  const remainingSeconds = targetSeconds - elapsedSeconds;

  return {
    elapsedSeconds,
    remainingSeconds,
    progressPercent: Math.min(100, Math.round((elapsedSeconds / targetSeconds) * 100)),
    isOvertime: remainingSeconds <= 0
  };
}

function formatCountdown(totalSeconds: number) {
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playCompletionTone() {
  try {
    const AudioContextClass = window.AudioContext;
    const audio = new AudioContextClass();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, audio.currentTime);
    oscillator.frequency.setValueAtTime(880, audio.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.46);
    oscillator.addEventListener("ended", () => void audio.close(), { once: true });
  } catch {
    // Browser audio can be unavailable in locked-down contexts; visual state still updates.
  }
}
