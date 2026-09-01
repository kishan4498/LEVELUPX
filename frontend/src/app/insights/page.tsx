"use client";

import clsx from "clsx";
import {
  BrainCircuit,
  CalendarClock,
  ChartNoAxesColumnIncreasing,
  Clock3,
  GitBranch,
  Flame,
  Lightbulb,
  ListFilter,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEventHandler, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { EmptyPanelMessage, MetaLabel, PageSection, PanelHeader, PanelTag, PanelTop, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { StatCard } from "@/components/ui/StatCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import {
  guidanceScoreLabel,
  guidanceScorePercent,
  insightTypeLabel,
  presentInsightMessage,
  presentInsightTitle
} from "@/lib/insightPresentation";
import { trackProductEvent } from "@/lib/productEvents";
import type { Quest } from "@/types/quest";
import type {
  AiInsight,
  InsightGenerationMeta,
  InsightLearningSummary,
  InsightScheduleStatus,
  InsightType,
  SchedulingTrainingDataset,
  StudySchedulePlan
} from "@/types/insight";

const insightMeta: Record<InsightType, { label: string; icon: typeof Lightbulb; badge: string; panel: string }> = {
  BURNOUT_WARNING: {
    label: insightTypeLabel("BURNOUT_WARNING") ?? "Workload",
    icon: ShieldAlert,
    badge: "bg-ember/12 text-ember",
    panel: "border-ember/20 bg-ember/5"
  },
  SCHEDULE_OPTIMIZATION: {
    label: "Schedule",
    icon: CalendarClock,
    badge: "bg-violet/12 text-violet",
    panel: "border-violet/20 bg-violet/5"
  },
  STUDY_SUGGESTION: {
    label: "Study",
    icon: Lightbulb,
    badge: "bg-mint/10 text-mint",
    panel: "border-mint/20 bg-mint/5"
  },
  CONSISTENCY_ANALYSIS: {
    label: "Consistency",
    icon: Flame,
    badge: "bg-mint/10 text-mint",
    panel: "border-mint/20 bg-mint/5"
  },
  RECOVERY_RECOMMENDATION: {
    label: "Recovery",
    icon: Sparkles,
    badge: "bg-ink/8 text-ink",
    panel: "border-ink/8 bg-white"
  }
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(date));
}

function providerLabel(provider: string | null | undefined) {
  return provider ? provider.replace(/-/g, " ") : "rule based";
}

function strategyLabel(strategy: StudySchedulePlan["strategy"]) {
  return strategy.toLowerCase().replace(/_/g, " ");
}

function riskClass(risk: StudySchedulePlan["riskLevel"]) {
  if (risk === "HIGH") {
    return "bg-ember/10 text-ember";
  }

  if (risk === "MEDIUM") {
    return "bg-violet/12 text-violet";
  }

  return "bg-mint/10 text-mint";
}

function readinessClass(readiness: SchedulingTrainingDataset["readiness"]) {
  if (readiness === "READY") {
    return "bg-mint/10 text-mint";
  }

  if (readiness === "COLLECTING") {
    return "bg-violet/12 text-violet";
  }

  return "bg-ink/8 text-ink/55";
}

function tuningClass(severity: InsightLearningSummary["tuningActions"][number]["severity"]) {
  if (severity === "ACTION") {
    return "bg-ember/10 text-ember";
  }

  return severity === "WATCH" ? "bg-violet/10 text-violet" : "bg-mint/10 text-mint";
}

function getNextWindow() {
  const now = new Date();
  const next = new Date(now);
  const hours = [6, 18];
  const nextHour = hours.find((hour) => now.getHours() < hour);

  if (nextHour === undefined) {
    next.setDate(now.getDate() + 1);
    next.setHours(hours[0]!, 0, 0, 0);
  } else {
    next.setHours(nextHour, 0, 0, 0);
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(next);
}

function DataTile({
  label,
  children,
  capitalize = false,
  wrap = false
}: {
  label: string;
  children: ReactNode;
  capitalize?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="rounded-md bg-paper px-3 py-3">
      <MetaLabel>{label}</MetaLabel>
      <p className={clsx("mt-1", wrap && "break-words", "text-sm font-semibold", capitalize && "capitalize")}>
        {children}
      </p>
    </div>
  );
}

function InsightPanel({ children }: { children: ReactNode }) {
  return <section className="mt-6 rounded-lg bg-white p-5 shadow-panel">{children}</section>;
}

function InsightPanelCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-white p-5 shadow-panel">{children}</div>;
}

function PanelHeading({
  icon: Icon,
  iconClass,
  title,
  children
}: {
  icon: typeof Lightbulb;
  iconClass: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={clsx("flex h-10 w-10 items-center justify-center rounded-md", iconClass)}>
        <Icon size={20} />
      </div>
      <div>
        <SectionHeading>{title}</SectionHeading>
        <SupportingText>{children}</SupportingText>
      </div>
    </div>
  );
}

function RoomyMessage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <p className={clsx("rounded-md bg-paper px-3 py-3 text-sm text-ink/55", wide && "sm:col-span-2")}>
      {children}
    </p>
  );
}

function FilterField({ fieldId, label, children }: { fieldId: string; label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={fieldId}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function LearningMetric({ label, metric, tone }: { label: string; metric: ReactNode; tone?: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <MetaLabel>{label}</MetaLabel>
      <p className={clsx("mt-1 text-sm font-semibold", tone)}>{metric}</p>
    </div>
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold text-ink/60">{children}</p>;
}

function StatusTag({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={clsx("rounded-md px-3 py-2 text-sm font-semibold", tone)}>{children}</span>;
}

function ScheduleSignalRow({
  title,
  badge,
  detail,
  compact = false
}: {
  title: string;
  badge: ReactNode;
  detail: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="rounded-md bg-paper px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink/60">{badge}</span>
      </div>
      <p className={compact ? "mt-2 text-xs text-ink/45" : "mt-2 text-sm leading-6 text-ink/55"}>{detail}</p>
    </div>
  );
}

function HistorySelect({
  fieldId,
  selected,
  onChange,
  children,
  capitalize = false
}: {
  fieldId: string;
  selected: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  children: ReactNode;
  capitalize?: boolean;
}) {
  return (
    <select
      className={clsx(
        "h-11 rounded-md border border-ink/12 bg-white px-3 text-sm font-normal",
        capitalize && "capitalize",
        "outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
      )}
      id={fieldId}
      onChange={onChange}
      value={selected}
    >
      {children}
    </select>
  );
}

type FeedbackValue = "HELPFUL" | "NOT_HELPFUL";

const feedbackMeta = {
  HELPFUL: { active: "bg-mint text-white", icon: ThumbsUp, label: "Helpful" },
  NOT_HELPFUL: { active: "bg-ember text-white", icon: ThumbsDown, label: "Not helpful" }
} as const;

const signalToneClass = {
  mint: "bg-mint",
  violet: "bg-violet"
} as const;

function FeedbackButton({
  feedback,
  selected,
  disabled,
  onClick
}: {
  feedback: FeedbackValue;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const meta = feedbackMeta[feedback];
  const Icon = meta.icon;

  return (
    <button
      className={clsx(
        "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition",
        selected ? meta.active : "bg-white text-ink/65 hover:text-ink"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon size={16} />
      {meta.label}
    </button>
  );
}

function SignalBar({
  label,
  metric,
  percent,
  tone
}: {
  label: string;
  metric: ReactNode;
  percent: number;
  tone: "mint" | "violet";
}) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold capitalize text-ink/65">{label}</span>
        <span className="font-semibold">{metric}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
        <div
          className={clsx("h-full rounded-full", signalToneClass[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function InsightFeedback({
  insight,
  busy,
  comment,
  onComment,
  onFeedback
}: {
  insight: AiInsight;
  busy: boolean;
  comment: string;
  onComment: (commentText: string) => void;
  onFeedback: (feedback: FeedbackValue) => void;
}) {
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <SupportingText>
          {insight.feedbackValue
            ? `Marked ${insight.feedbackValue === "HELPFUL" ? "helpful" : "not helpful"}`
            : "Was this insight useful?"}
        </SupportingText>
        <div className="flex flex-wrap gap-2">
          <FeedbackButton
            disabled={busy}
            onClick={() => onFeedback("HELPFUL")}
            selected={insight.feedbackValue === "HELPFUL"}
            feedback="HELPFUL"
          />
          <FeedbackButton
            disabled={busy}
            onClick={() => onFeedback("NOT_HELPFUL")}
            selected={insight.feedbackValue === "NOT_HELPFUL"}
            feedback="NOT_HELPFUL"
          />
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-ink/8 bg-white/70 p-4">
        <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={`feedback-comment-${insight.id}`}>
          <span>Comment</span>
          <textarea
            className="min-h-20 resize-y rounded-md border border-ink/15 bg-white px-3 py-2 text-sm font-normal leading-6 outline-none transition placeholder:text-ink/35 focus:border-mint focus:ring-2 focus:ring-mint/20"
            disabled={busy}
            id={`feedback-comment-${insight.id}`}
            maxLength={500}
            onChange={(event) => onComment(event.target.value)}
            placeholder="Add a note about why this insight helped or missed the mark."
            value={comment}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/45">
            {insight.feedbackComment
              ? `Saved ${insight.feedbackAt ? formatDate(insight.feedbackAt) : "recently"}`
              : "Comments are saved with helpful/not helpful feedback."}
          </p>
          <Button
            disabled={busy || !insight.feedbackValue}
            onClick={() =>
              insight.feedbackValue ? onFeedback(insight.feedbackValue as FeedbackValue) : undefined
            }
            type="button"
            variant="ghost"
          >
            Save comment
          </Button>
        </div>
      </div>
    </>
  );
}

function InsightCard({
  insight,
  actionBusy,
  feedbackBusy,
  comment,
  onAction,
  onComment,
  onFeedback
}: {
  insight: AiInsight;
  actionBusy: boolean;
  feedbackBusy: boolean;
  comment: string;
  onAction: () => void;
  onComment: (commentText: string) => void;
  onFeedback: (feedback: FeedbackValue) => void;
}) {
  const meta = insightMeta[insight.insightType];
  const Icon = meta.icon;
  const guidanceScore = guidanceScorePercent(insight.confidenceScore);
  const isRecovery =
    insight.insightType === "BURNOUT_WARNING" || insight.insightType === "RECOVERY_RECOMMENDATION";

  return (
    <article className={clsx("rounded-lg border p-5", meta.panel)}>
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white text-ink shadow-sm">
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{presentInsightTitle(insight)}</h3>
            <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", meta.badge)}>{meta.label}</span>
            <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold capitalize text-ink/55">
              {providerLabel(insight.providerSource)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/65">{presentInsightMessage(insight)}</p>
          <Button
            className="mt-4"
            disabled={actionBusy}
            onClick={onAction}
            type="button"
            variant="secondary"
          >
            {isRecovery ? <Plus size={16} /> : <Play size={16} />}
            {actionBusy
              ? "Preparing..."
              : isRecovery
                ? "Create recovery quest"
                : "Start recommended focus"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
        <div className="h-2 w-full max-w-xs rounded-full bg-ink/8">
          <div className="h-2 rounded-full bg-mint" style={{ width: `${guidanceScore}%` }} />
        </div>
        <span className="text-sm font-semibold text-ink/60">
          {guidanceScore}% {guidanceScoreLabel(insight.providerSource).toLowerCase()} / {formatDate(insight.generatedAt)}
        </span>
      </div>
      <InsightFeedback
        busy={feedbackBusy}
        comment={comment}
        insight={insight}
        onComment={onComment}
        onFeedback={onFeedback}
      />
    </article>
  );
}

function LearningPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink/8 p-4">
      <PanelLabel>{title}</PanelLabel>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}

function LearningSignalPanel({
  title,
  emptyText,
  signals,
  tone,
  metric
}: {
  title: string;
  emptyText: string;
  signals: InsightLearningSummary["providerSignals"];
  tone: "mint" | "violet";
  metric: "helpful" | "ratings";
}) {
  return (
    <LearningPanel title={title}>
        {signals.length === 0 ? (
          <EmptyPanelMessage>{emptyText}</EmptyPanelMessage>
        ) : (
          signals.map((signal) => (
            <SignalBar
              key={signal.key}
              label={signal.label}
              percent={signal.helpfulRate}
              tone={tone}
              metric={metric === "helpful" ? `${signal.helpfulRate}% helpful` : `${signal.total} ratings`}
            />
          ))
        )}
    </LearningPanel>
  );
}

function PromptRunSignal({ signal }: { signal: InsightLearningSummary["promptVersionSignals"][number] }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink/65">{signal.label}</span>
        <span className="font-semibold">{signal.fallbackRate}% fallback</span>
      </div>
      <p className="mt-2 text-xs text-ink/45">
        {signal.totalRuns} runs / {signal.totalInsights} insights / {signal.averageDurationMs}ms avg
      </p>
    </div>
  );
}

function TuningActionCard({ action }: { action: InsightLearningSummary["tuningActions"][number] }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={clsx(
            "rounded-md px-2 py-1 text-xs font-semibold",
            tuningClass(action.severity)
          )}
        >
          {action.severity}
        </span>
        <span className="text-sm font-semibold text-ink/70">{action.title}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/55">{action.detail}</p>
    </div>
  );
}

type InsightHistoryGroup = {
  day: string;
  insights: AiInsight[];
};

function HistoryGroup({
  group,
  actionId,
  feedbackId,
  comments,
  onAction,
  onComment,
  onFeedback
}: {
  group: InsightHistoryGroup;
  actionId: string | null;
  feedbackId: string | null;
  comments: Record<string, string>;
  onAction: (insight: AiInsight) => Promise<void>;
  onComment: (insightId: string, commentText: string) => void;
  onFeedback: (insightId: string, feedback: FeedbackValue) => Promise<void>;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">{group.day}</span>
        <span className="text-sm font-semibold text-ink/45">{group.insights.length} recommendation{group.insights.length === 1 ? "" : "s"}</span>
      </div>

      {group.insights.map((insight) => (
        <InsightCard
          actionBusy={actionId === insight.id}
          comment={comments[insight.id] ?? ""}
          feedbackBusy={feedbackId === insight.id}
          insight={insight}
          key={insight.id}
          onAction={() => void onAction(insight)}
          onComment={(commentText) => onComment(insight.id, commentText)}
          onFeedback={(feedback) => void onFeedback(insight.id, feedback)}
        />
      ))}
    </div>
  );
}

function groupInsights(insights: AiInsight[]) {
  return insights.reduce<InsightHistoryGroup[]>((groups, insight) => {
    const day = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(insight.generatedAt));
    const matchingGroup = groups.find((group) => group.day === day);

    if (matchingGroup) {
      matchingGroup.insights.push(insight);
    } else {
      groups.push({ day, insights: [insight] });
    }

    return groups;
  }, []);
}

function replaceInsight(insights: AiInsight[], savedInsight: AiInsight) {
  return insights.map((insight) => (insight.id === savedInsight.id ? savedInsight : insight));
}

const emptyScheduleStatus: InsightScheduleStatus = {
  jobName: "scheduled-insights",
  command: "npm run jobs:run -- scheduled-insights",
  cadence: "twice-daily",
  targetHoursUtc: [6, 18],
  dedupWindowHours: 12,
  hostedEnabled: false,
  effectiveHostedEnabled: false,
  hostedProvider: null,
  timezone: "UTC",
  promptVersion: "rules-v1",
  rolloutPercent: 100,
  externalProviderRequired: false,
  externalProviderReady: false,
  externalProviderName: null,
  externalProviderAuth: null,
  externalProviderRequestFormat: "levelupx-insight-v1",
  hostedRolloutReady: false,
  rolloutBlockedReason: null
};

const emptyLearningSummary: InsightLearningSummary = {
  totalFeedback: 0,
  helpful: 0,
  notHelpful: 0,
  helpfulRate: 0,
  promptRunCount: 0,
  fallbackRunCount: 0,
  fallbackRate: 0,
  providerSignals: [],
  typeSignals: [],
  promptVersionSignals: [],
  latestFeedbackAt: null,
  recommendation: "Collect helpful or not helpful ratings before tuning provider prompts.",
  tuningActions: []
};

const emptyStudyPlan: StudySchedulePlan = {
  generatedAt: "",
  strategy: "BALANCED",
  riskLevel: "LOW",
  focusBudgetMinutes: 0,
  recommendedBlockMinutes: 25,
  backlogCount: 0,
  overdueCount: 0,
  dueSoonCount: 0,
  recentFocusMinutes: 0,
  activeFocusDaysLast7Days: 0,
  steps: []
};

const emptyTrainingDataset: SchedulingTrainingDataset = {
  generatedAt: "",
  readiness: "NOT_READY",
  sampleCount: 0,
  completedCount: 0,
  failedCount: 0,
  focusMinutesLast14Days: 0,
  activeFocusDaysLast14Days: 0,
  recommendedModelTarget: "Predict next focus block length and deadline-risk priority from quest outcomes and focus load.",
  signals: []
};

export default function InsightsPage() {
  const router = useRouter();
  const { accessToken } = useRequireAuth();
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<InsightGenerationMeta | null>(null);
  const [schedule, setSchedule] = useState<InsightScheduleStatus>(emptyScheduleStatus);
  const [learning, setLearning] = useState<InsightLearningSummary>(emptyLearningSummary);
  const [plan, setPlan] = useState<StudySchedulePlan>(emptyStudyPlan);
  const [training, setTraining] = useState<SchedulingTrainingDataset>(emptyTrainingDataset);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | InsightType>("ALL");
  const [providerFilter, setProviderFilter] = useState("ALL");
  const [feedbackFilter, setFeedbackFilter] = useState<"ALL" | "HELPFUL" | "NOT_HELPFUL" | "UNMARKED">("ALL");

  const latest = insights[0] ?? null;
  const nextWindow = useMemo(() => getNextWindow(), []);
  const provider = lastMeta?.providerSource ?? latest?.providerSource ?? "rule-based";
  const promptVersion = lastMeta?.promptVersion ?? "rules-v1";
  const runStatus = lastMeta?.usedFallback ? "Fallback used" : lastMeta ? "Primary path" : "Ready";

  const typeCounts = useMemo(() => {
    return insights.reduce<Record<string, number>>((acc, insight) => {
      acc[insight.insightType] = (acc[insight.insightType] ?? 0) + 1;
      return acc;
    }, {});
  }, [insights]);

  const sourceCounts = useMemo(() => {
    return insights.reduce<Record<string, number>>((acc, insight) => {
      const provider = insight.providerSource ?? "rule-based";
      acc[provider] = (acc[provider] ?? 0) + 1;
      return acc;
    }, {});
  }, [insights]);

  const providers = useMemo(() => {
    return Object.entries(sourceCounts)
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);
  }, [sourceCounts]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    return insights.filter((insight) => {
      const provider = insight.providerSource ?? "rule-based";
      const matchesSearch =
        !search ||
        presentInsightTitle(insight).toLowerCase().includes(search) ||
        presentInsightMessage(insight).toLowerCase().includes(search) ||
        providerLabel(provider).toLowerCase().includes(search);
      const matchesType = typeFilter === "ALL" || insight.insightType === typeFilter;
      const matchesProvider = providerFilter === "ALL" || provider === providerFilter;
      const matchesFeedback =
        feedbackFilter === "ALL" ||
        (feedbackFilter === "UNMARKED" && !insight.feedbackValue) ||
        insight.feedbackValue === feedbackFilter;

      return matchesSearch && matchesType && matchesProvider && matchesFeedback;
    });
  }, [feedbackFilter, providerFilter, query, typeFilter, insights]);

  const grouped = useMemo(() => groupInsights(filtered), [filtered]);

  const ratings = useMemo(() => {
    return insights.reduce(
      (counts, insight) => {
        if (insight.feedbackValue === "HELPFUL") {
          counts.helpful += 1;
        } else if (insight.feedbackValue === "NOT_HELPFUL") {
          counts.notHelpful += 1;
        } else {
          counts.unmarked += 1;
        }

        return counts;
      },
      { helpful: 0, notHelpful: 0, unmarked: 0 }
    );
  }, [insights]);

  const promptRuns = lastMeta
    ? [
        { label: "Provider", value: providerLabel(lastMeta.providerSource) },
        { label: "Prompt version", value: lastMeta.promptVersion },
        { label: "Insights", value: String(lastMeta.insightCount) },
        { label: "Duration", value: `${lastMeta.durationMs}ms` },
        { label: "Fallback", value: lastMeta.usedFallback ? "Yes" : "No" }
      ]
    : [];

  const loadInsights = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [history, scheduleData, learningData, planData, trainingData] = await Promise.all([
        apiRequest<{ insights: AiInsight[] }>("/ai-insights"),
        apiRequest<{ schedule: InsightScheduleStatus }>("/ai-insights/schedule"),
        apiRequest<{ learning: InsightLearningSummary }>("/ai-insights/learning"),
        apiRequest<{ studyPlan: StudySchedulePlan }>("/ai-insights/study-plan"),
        apiRequest<{ training: SchedulingTrainingDataset }>("/ai-insights/scheduling-training")
      ]);
      setInsights(history.insights);
      setSchedule(scheduleData.schedule);
      setLearning(learningData.learning);
      setPlan(planData.studyPlan);
      setTraining(trainingData.training);
      setComments(
        Object.fromEntries(history.insights.map((insight) => [insight.id, insight.feedbackComment ?? ""]))
      );
    } catch (err) {
      setError(errorMessage(err, "Could not load insights"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  async function generateInsights() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    setLastMeta(null);

    try {
      const { insights: generated, meta } = await apiRequest<{
        insights: AiInsight[];
        meta: InsightGenerationMeta;
      }>("/ai-insights/generate", { method: "POST" });

      setLastMeta(meta);
      setNotice(
        `${generated.length} insight${generated.length === 1 ? "" : "s"} generated via ${meta.providerSource} (${meta.promptVersion}) in ${meta.durationMs}ms.`
      );
      await loadInsights();
    } catch (err) {
      setError(errorMessage(err, "Could not generate insights"));
    } finally {
      setGenerating(false);
    }
  }

  async function submitFeedback(id: string, feedback: "HELPFUL" | "NOT_HELPFUL") {
    setFeedbackId(id);
    setError(null);
    setNotice(null);

    try {
      const comment = comments[id]?.trim() || null;
      const { insight: saved } = await apiRequest<{ insight: AiInsight }>(`/ai-insights/${id}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ feedbackValue: feedback, feedbackComment: comment })
      });

      setInsights((currentInsights) => replaceInsight(currentInsights, saved));
      setComments((currentComments) => ({
        ...currentComments,
        [saved.id]: saved.feedbackComment ?? ""
      }));
      void loadInsights();
      setNotice("Insight feedback saved.");
    } catch (err) {
      setError(errorMessage(err, "Could not save insight feedback"));
    } finally {
      setFeedbackId(null);
    }
  }

  async function actOnInsight(insight: AiInsight) {
    setActionId(insight.id);
    setError(null);
    setNotice(null);

    try {
      const isRecovery =
        insight.insightType === "BURNOUT_WARNING" || insight.insightType === "RECOVERY_RECOMMENDATION";

      if (isRecovery) {
        const { quest: recoveryQuest } = await apiRequest<{ quest: Quest }>("/quests", {
          method: "POST",
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            title: `Recovery: ${presentInsightTitle(insight)}`.slice(0, 100),
            description: presentInsightMessage(insight).slice(0, 500),
            difficulty: "RECOVERY",
            category: "Wellbeing",
            estimatedMinutes: Math.max(10, Math.min(30, plan.recommendedBlockMinutes || 15)),
            priority: "HIGH",
            tags: ["recovery", "insight"]
          })
        });
        void trackProductEvent("insight_actioned", {
          insightType: insight.insightType,
          action: "recovery_quest"
        });
        router.push(`/focus?quest=${recoveryQuest.id}`);
        return;
      }

      const questId = plan.steps.find((step) => step.questId)?.questId;
      const focusQuery = new URLSearchParams({
        minutes: String(plan.recommendedBlockMinutes || 25)
      });

      if (questId) {
        focusQuery.set("quest", questId);
      }

      void trackProductEvent("insight_actioned", {
        insightType: insight.insightType,
        action: "focus_session"
      });
      router.push(`/focus?${focusQuery.toString()}`);
    } catch (err) {
      setError(errorMessage(err, "Could not turn this insight into an action."));
      setActionId(null);
    }
  }

  function updateInsightComment(insightId: string, commentText: string) {
    setComments((currentComments) => ({
      ...currentComments,
      [insightId]: commentText
    }));
  }

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Insights" title="AI productivity insights">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="rounded-lg bg-ink p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-white/10 text-mint">
              <BrainCircuit size={22} />
            </div>
            <h2 className="text-xl font-bold">Generate a fresh read</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
              Insights are generated from your quests and focus sessions with the local rules already built into LevelUpX.
            </p>
          </div>
          <Button className="bg-white text-ink hover:bg-white/90" disabled={generating || loading} onClick={() => void generateInsights()}>
            <RefreshCw size={18} />
            Generate
          </Button>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <InsightPanelCard>
          <PanelHeading icon={CalendarClock} iconClass="bg-violet/12 text-violet" title="Generation cadence">
            Manual reads and scheduled recommendations share the same provider fallback.
          </PanelHeading>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <DataTile label="Manual">{generating ? "Running" : "Ready"}</DataTile>
            <DataTile label="Scheduled">
              {schedule.cadence === "twice-daily" ? "Twice daily" : schedule.cadence}
            </DataTile>
            <DataTile label="Dedup">{schedule.dedupWindowHours} hours</DataTile>
          </div>
        </InsightPanelCard>

        <InsightPanelCard>
          <PanelHeading icon={Clock3} iconClass="bg-mint/12 text-mint" title="Recommendation window">
            Next planned window around {nextWindow}
          </PanelHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DataTile label="Provider">{providerLabel(provider)}</DataTile>
            <DataTile label="Prompt">{lastMeta?.promptVersion ?? schedule.promptVersion}</DataTile>
          </div>
        </InsightPanelCard>
      </section>

      <InsightPanel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PanelHeading icon={Clock3} iconClass="bg-ember/12 text-ember" title="Hosted scheduling control">
            Runtime intent for the background recommendation job.
          </PanelHeading>
          <StatusTag tone={schedule.effectiveHostedEnabled ? "bg-mint/10 text-mint" : "bg-paper text-ink/60"}>
            {schedule.effectiveHostedEnabled ? "Hosted enabled" : schedule.hostedEnabled ? "Hosted blocked" : "Manual runner"}
          </StatusTag>
        </div>

        {schedule.rolloutBlockedReason && (
          <p className="mt-4 rounded-md bg-ember/10 px-3 py-2 text-sm font-semibold text-ember">
            {schedule.rolloutBlockedReason}
          </p>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <DataTile label="Job">{schedule.jobName}</DataTile>
          <DataTile label="Provider">{schedule.hostedProvider ?? "Not configured"}</DataTile>
          <DataTile label="UTC hours">{schedule.targetHoursUtc.join(", ")}</DataTile>
          <DataTile label="Timezone">{schedule.timezone}</DataTile>
          <DataTile label="Command" wrap>{schedule.command}</DataTile>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <DataTile label="Rollout">{schedule.rolloutPercent}% of active users</DataTile>
          <DataTile label="External required">{schedule.externalProviderRequired ? "Yes" : "No"}</DataTile>
          <DataTile label="External ready">{schedule.externalProviderReady ? "Ready" : "Not ready"}</DataTile>
          <DataTile label="Hosted profile">{schedule.externalProviderName ?? "Rules"}</DataTile>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <DataTile label="Request format" wrap>{schedule.externalProviderRequestFormat}</DataTile>
          <DataTile label="Auth profile" wrap>{schedule.externalProviderAuth ?? "Not configured"}</DataTile>
          <DataTile label="Hosted rollout">{schedule.hostedRolloutReady ? "Profile ready" : "Profile pending"}</DataTile>
        </div>
      </InsightPanel>

      <InsightPanel>
        <PanelTop>
          <PanelHeading icon={ListFilter} iconClass="bg-violet/12 text-violet" title="Study schedule plan">
            Quest deadlines and recent focus load shape the next work block.
          </PanelHeading>
          <StatusTag tone={riskClass(plan.riskLevel)}>
            {plan.riskLevel} risk
          </StatusTag>
        </PanelTop>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <DataTile label="Strategy" capitalize>{strategyLabel(plan.strategy)}</DataTile>
          <DataTile label="Budget">{plan.focusBudgetMinutes} min</DataTile>
          <DataTile label="Block">{plan.recommendedBlockMinutes} min</DataTile>
          <DataTile label="Backlog">{plan.backlogCount} quests</DataTile>
          <DataTile label="Deadlines">{plan.overdueCount} overdue / {plan.dueSoonCount} soon</DataTile>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="rounded-lg border border-ink/8 p-4">
            <PanelLabel>Focus load</PanelLabel>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-paper px-3 py-2">
                <MetaLabel>Last 3 days</MetaLabel>
                <p className="mt-1 text-sm font-semibold">{plan.recentFocusMinutes} min</p>
              </div>
              <div className="rounded-md bg-paper px-3 py-2">
                <MetaLabel>Active days</MetaLabel>
                <p className="mt-1 text-sm font-semibold">{plan.activeFocusDaysLast7Days}/7</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {plan.steps.length === 0 ? (
              <RoomyMessage>No schedule steps available yet.</RoomyMessage>
            ) : (
              plan.steps.map((step, index) => (
                <ScheduleSignalRow
                  badge={`${step.minutes} min`}
                  detail={step.detail}
                  key={`${step.label}-${index}`}
                  title={step.label}
                />
              ))
            )}
          </div>
        </div>
      </InsightPanel>

      <InsightPanel>
        <PanelTop>
          <PanelHeading icon={ChartNoAxesColumnIncreasing} iconClass="bg-mint/12 text-mint" title="Scheduling training signals">
            Recent quest outcomes and focus load prepared for future personalization.
          </PanelHeading>
          <StatusTag tone={readinessClass(training.readiness)}>
            {training.readiness.replace(/_/g, " ")}
          </StatusTag>
        </PanelTop>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <DataTile label="Samples">{training.sampleCount}</DataTile>
          <DataTile label="Completed">{training.completedCount}</DataTile>
          <DataTile label="Failed">{training.failedCount}</DataTile>
          <DataTile label="Focus">{training.focusMinutesLast14Days} min</DataTile>
          <DataTile label="Active days">{training.activeFocusDaysLast14Days}/14</DataTile>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <p className="rounded-lg border border-ink/8 px-4 py-3 text-sm leading-6 text-ink/60">
            {training.recommendedModelTarget}
          </p>
          <div className="grid gap-2">
            {training.signals.length === 0 ? (
              <RoomyMessage>No scheduling signals collected yet.</RoomyMessage>
            ) : (
              training.signals.slice(0, 4).map((signal) => (
                <ScheduleSignalRow
                  badge={signal.completionLabel}
                  compact
                  detail={<>{signal.category} / {signal.estimatedMinutes} min / lead {signal.leadTimeHours ?? "n/a"}h</>}
                  key={signal.questId}
                  title={signal.title}
                />
              ))
            )}
          </div>
        </div>
      </InsightPanel>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InsightPanelCard>
          <PanelHeading icon={GitBranch} iconClass="bg-violet/12 text-violet" title="Prompt run details">
            Latest manual generation metadata from the active provider path.
          </PanelHeading>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {promptRuns.length === 0 ? (
              <RoomyMessage wide>
                Generate insights to see prompt version, duration, fallback, and provider metadata.
              </RoomyMessage>
            ) : (
              promptRuns.map((promptRun) => (
                <DataTile key={promptRun.label} label={promptRun.label} capitalize>{promptRun.value}</DataTile>
              ))
            )}
          </div>
        </InsightPanelCard>

        <InsightPanelCard>
          <PanelHeading icon={BrainCircuit} iconClass="bg-mint/12 text-mint" title="Provider mix">
            Stored insights grouped by the provider source saved with each row.
          </PanelHeading>

          <div className="mt-4 grid gap-2">
            {loading ? (
              <RoomyMessage>Loading provider mix...</RoomyMessage>
            ) : providers.length === 0 ? (
              <RoomyMessage>No provider history yet.</RoomyMessage>
            ) : (
              providers.map((source) => (
                <div className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-3" key={source.provider}>
                  <span className="text-sm font-semibold capitalize">{providerLabel(source.provider)}</span>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink/60">{source.count} insights</span>
                </div>
              ))
            )}
          </div>
        </InsightPanelCard>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard icon={BrainCircuit} iconClass="text-violet" label="Stored insights" metric={insights.length} />
        <StatCard
          icon={Sparkles}
          iconClass="text-mint"
          label="Latest guidance score"
          metric={latest ? `${guidanceScorePercent(latest.confidenceScore)}%` : "0%"}
        />
        <StatCard icon={Lightbulb} iconClass="text-ember" label="Run status" metric={runStatus} />
      </section>

      <InsightPanel>
        <PanelTop>
          <PanelHeading icon={ChartNoAxesColumnIncreasing} iconClass="bg-mint/12 text-mint" title="Provider learning loop">
            Feedback signals grouped by provider and recommendation type.
          </PanelHeading>
          <PanelTag>
            {learning.totalFeedback} ratings / {learning.fallbackRate}% fallback
          </PanelTag>
        </PanelTop>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-lg bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PanelLabel>Feedback quality</PanelLabel>
              <p className="text-sm text-ink/45">
                {learning.latestFeedbackAt ? `Latest ${formatDate(learning.latestFeedbackAt)}` : "No ratings yet"}
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <LearningMetric label="Helpful" metric={learning.helpful} tone="text-mint" />
              <LearningMetric label="Not helpful" metric={learning.notHelpful} tone="text-ember" />
              <LearningMetric label="Helpful rate" metric={`${learning.helpfulRate}%`} />
            </div>
            <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm leading-6 text-ink/60">{learning.recommendation}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LearningSignalPanel
              emptyText="No provider feedback yet."
              metric="helpful"
              signals={learning.providerSignals}
              title="Provider signals"
              tone="mint"
            />
            <LearningSignalPanel
              emptyText="No type feedback yet."
              metric="ratings"
              signals={learning.typeSignals}
              title="Type signals"
              tone="violet"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <LearningPanel title="Prompt run signals">
              {learning.promptVersionSignals.length === 0 ? (
                <EmptyPanelMessage>No prompt run history yet.</EmptyPanelMessage>
              ) : (
                learning.promptVersionSignals.map((signal) => (
                  <PromptRunSignal key={signal.key} signal={signal} />
                ))
              )}
          </LearningPanel>

          <LearningPanel title="Tuning actions">
              {learning.tuningActions.length === 0 ? (
                <EmptyPanelMessage>No tuning actions yet.</EmptyPanelMessage>
              ) : (
                learning.tuningActions.map((action) => (
                  <TuningActionCard action={action} key={`${action.severity}-${action.title}`} />
                ))
              )}
          </LearningPanel>
        </div>
      </InsightPanel>

      <InsightPanel>
        <PanelTop>
          <PanelHeading icon={ListFilter} iconClass="bg-ember/12 text-ember" title="Recommendation history controls">
            Showing {filtered.length} of {insights.length} stored insights.
          </PanelHeading>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <span className="rounded-md bg-mint/10 px-3 py-2 font-semibold text-mint">{ratings.helpful} helpful</span>
            <span className="rounded-md bg-ember/10 px-3 py-2 font-semibold text-ember">{ratings.notHelpful} not helpful</span>
            <span className="rounded-md bg-paper px-3 py-2 font-semibold text-ink/55">{ratings.unmarked} unmarked</span>
          </div>
        </PanelTop>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(150px,1fr))]">
          <FilterField fieldId="insight-history-search" label="Search">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" size={17} />
              <input
                className="h-11 w-full rounded-md border border-ink/12 bg-white pl-10 pr-3 text-sm font-normal outline-none transition placeholder:text-ink/35 focus:border-mint focus:ring-2 focus:ring-mint/20"
                id="insight-history-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, message, or provider"
                value={query}
              />
            </span>
          </FilterField>

          <FilterField fieldId="insight-type-filter" label="Type">
            <HistorySelect
              fieldId="insight-type-filter"
              onChange={(event) => setTypeFilter(event.target.value as "ALL" | InsightType)}
              selected={typeFilter}
            >
              <option value="ALL">All types</option>
              {(Object.keys(insightMeta) as InsightType[]).map((type) => (
                <option key={type} value={type}>
                  {insightMeta[type].label} ({typeCounts[type] ?? 0})
                </option>
              ))}
            </HistorySelect>
          </FilterField>

          <FilterField fieldId="insight-provider-filter" label="Provider">
            <HistorySelect
              capitalize
              fieldId="insight-provider-filter"
              onChange={(event) => setProviderFilter(event.target.value)}
              selected={providerFilter}
            >
              <option value="ALL">All providers</option>
              {providers.map((source) => (
                <option key={source.provider} value={source.provider}>
                  {providerLabel(source.provider)} ({source.count})
                </option>
              ))}
            </HistorySelect>
          </FilterField>

          <FilterField fieldId="insight-feedback-filter" label="Feedback">
            <HistorySelect
              fieldId="insight-feedback-filter"
              onChange={(event) => setFeedbackFilter(event.target.value as "ALL" | "HELPFUL" | "NOT_HELPFUL" | "UNMARKED")}
              selected={feedbackFilter}
            >
              <option value="ALL">All feedback</option>
              <option value="HELPFUL">Helpful</option>
              <option value="NOT_HELPFUL">Not helpful</option>
              <option value="UNMARKED">Unmarked</option>
            </HistorySelect>
          </FilterField>
        </div>
      </InsightPanel>

      <PageSection>
        <PanelHeader>
          <div>
            <SectionHeading>Insight history</SectionHeading>
            <SupportingText spaced>Newest generated insights appear first.</SupportingText>
          </div>
          <PanelTag>
            {lastMeta ? `${providerLabel(lastMeta.providerSource)} / ${lastMeta.promptVersion}` : `${providerLabel(provider)} / ${promptVersion}`}
            {lastMeta?.usedFallback ? " (fallback)" : ""}
          </PanelTag>
        </PanelHeader>

        <div className="mt-5 space-y-4">
          {loading ? (
            <EmptyPanelMessage>Loading insights...</EmptyPanelMessage>
          ) : insights.length === 0 ? (
            <EmptyPanelMessage>No insights generated yet.</EmptyPanelMessage>
          ) : filtered.length === 0 ? (
            <EmptyPanelMessage>No insights match the current history filters.</EmptyPanelMessage>
          ) : (
            grouped.map((group) => (
              <HistoryGroup
                actionId={actionId}
                comments={comments}
                feedbackId={feedbackId}
                group={group}
                key={group.day}
                onAction={actOnInsight}
                onComment={updateInsightComment}
                onFeedback={submitFeedback}
              />
            ))
          )}
        </div>
      </PageSection>
    </AppShell>
  );
}
