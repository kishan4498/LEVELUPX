"use client";

import { clsx } from "clsx";
import { BarChart3, CheckCircle2, Clock, Download, Flame, Lightbulb, Sparkles, Target, XCircle, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { AppShell } from "@/components/layout/AppShell";
import { Notice } from "@/components/ui/Notice";
import { PagePanel, PanelHeader, PanelTag, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { StatCard } from "@/components/ui/StatCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import type { AnalyticsRecommendationMeta, FocusConsistency, HeatmapDay, WeeklySummary } from "@/types/analytics";

const emptyWeeklySummary: WeeklySummary = {
  from: "",
  to: "",
  completedQuests: 0,
  failedQuests: 0,
  xpGained: 0,
  focusMinutes: 0,
  completionRate: 0
};

const emptyConsistency: FocusConsistency = {
  daysTracked: 0,
  activeDays: 0,
  consistencyRate: 0,
  averageFocusMinutesOnActiveDays: 0,
  bestFocusDay: null
};

const emptyRecommendationMeta: AnalyticsRecommendationMeta = {
  providerSource: "rule-based",
  promptVersion: "analytics-rules-v1",
  usedFallback: true,
  durationMs: 0
};

function formatDate(timestamp: string) {
  if (!timestamp) {
    return "Not tracked";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function formatRange(from: string, to: string) {
  if (!from || !to) {
    return "Last 7 days";
  }

  return `${formatDate(from)} - ${formatDate(to)}`;
}

function activityScore(day: HeatmapDay) {
  // Normalize unlike metrics so raw XP does not dominate the heatmap.
  return day.completedQuests * 20 + day.focusMinutes + Math.round(day.xpGained / 10);
}

function activityLevel(day: HeatmapDay, maxActivity: number) {
  const score = activityScore(day);

  if (score <= 0 || maxActivity <= 0) {
    return "bg-ink/6";
  }

  const ratio = score / maxActivity;

  if (ratio >= 0.75) {
    return "bg-mint";
  }

  if (ratio >= 0.5) {
    return "bg-violet";
  }

  if (ratio >= 0.25) {
    return "bg-ember";
  }

  return "bg-ink/20";
}

function csvCell(cell: string | number | null) {
  const raw = cell === null ? "" : String(cell);
  return `"${raw.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, csvLines: (string | number | null)[][]) {
  const csv = csvLines.map((csvLine) => csvLine.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function PanelTitle({ icon: Icon, iconClass, title, children }: { icon: LucideIcon; iconClass: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className={clsx("flex h-10 w-10 items-center justify-center rounded-md", iconClass)}>
        <Icon size={20} />
      </div>
      <div>
        <SectionHeading>{title}</SectionHeading>
        {children}
      </div>
    </div>
  );
}

function SmallMetric({ label, metric, large = false }: { label: string; metric: ReactNode; large?: boolean }) {
  return (
    <div className="rounded-lg bg-paper p-4">
      <SupportingText>{label}</SupportingText>
      <p className={clsx("mt-1", large ? "text-3xl" : "text-2xl", "font-bold")}>{metric}</p>
    </div>
  );
}

function StateText({ children, surface = "paper", wide = false }: { children: ReactNode; surface?: "paper" | "white"; wide?: boolean }) {
  return (
    <p className={clsx(wide && "col-span-10", surface === "paper" ? "rounded-md bg-paper px-3 py-2 text-sm text-ink/55" : "rounded-md bg-white px-3 py-2 text-sm text-ink/55")}>
      {children}
    </p>
  );
}

export default function AnalyticsPage() {
  const { accessToken } = useRequireAuth();
  const [summary, setSummary] = useState<WeeklySummary>(emptyWeeklySummary);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [consistency, setConsistency] = useState<FocusConsistency>(emptyConsistency);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [meta, setMeta] = useState<AnalyticsRecommendationMeta>(emptyRecommendationMeta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const maxActivity = useMemo(() => heatmap.reduce((max, day) => Math.max(max, activityScore(day)), 0), [heatmap]);

  const monthlyActivity = useMemo(() => {
    return heatmap.reduce(
      (acc, day) => {
        acc.completedQuests += day.completedQuests;
        acc.focusMinutes += day.focusMinutes;
        acc.xpGained += day.xpGained;
        return acc;
      },
      { completedQuests: 0, focusMinutes: 0, xpGained: 0 }
    );
  }, [heatmap]);

  const weeklyChart = useMemo(
    () => [
      { label: "Completed", value: summary.completedQuests, fill: "#16a34a", suffix: "quests" },
      { label: "Failed", value: summary.failedQuests, fill: "#f97316", suffix: "quests" },
      { label: "Focus", value: summary.focusMinutes, fill: "#16a34a", suffix: "min" },
      { label: "XP", value: summary.xpGained, fill: "#7c3aed", suffix: "XP" }
    ],
    [summary.completedQuests, summary.failedQuests, summary.focusMinutes, summary.xpGained]
  );

  const heatmapTrend = useMemo(() => {
    return heatmap.map((day) => ({
      date: formatDate(day.date),
      completedQuests: day.completedQuests,
      focusMinutes: day.focusMinutes,
      xpGained: day.xpGained
    }));
  }, [heatmap]);

  const topDays = useMemo(() => {
    return [...heatmap]
      .map((day) => ({
        ...day,
        label: formatDate(day.date),
        score: activityScore(day)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
  }, [heatmap]);

  const loadAnalytics = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [weekly, month, focus, recs] = await Promise.all([
        apiRequest<{ summary: WeeklySummary }>("/analytics/weekly-summary"),
        apiRequest<{ heatmap: HeatmapDay[] }>("/analytics/monthly-heatmap"),
        apiRequest<{ consistency: FocusConsistency }>("/analytics/focus-consistency"),
        apiRequest<{ recommendations: string[]; meta: AnalyticsRecommendationMeta }>("/analytics/recommendations")
      ]);

      setSummary(weekly.summary);
      setHeatmap(month.heatmap);
      setConsistency(focus.consistency);
      setRecommendations(recs.recommendations);
      setMeta(recs.meta);
    } catch (err) {
      setError(errorMessage(err, "Could not load analytics"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  function exportAnalytics() {
    const csvLines: (string | number | null)[][] = [
      ["section", "date", "metric", "value", "detail"],
      ["weekly", summary.from, "windowStart", summary.from, null],
      ["weekly", summary.to, "windowEnd", summary.to, null],
      ["weekly", null, "completedQuests", summary.completedQuests, null],
      ["weekly", null, "failedQuests", summary.failedQuests, null],
      ["weekly", null, "xpGained", summary.xpGained, null],
      ["weekly", null, "focusMinutes", summary.focusMinutes, null],
      ["weekly", null, "completionRate", summary.completionRate, "percent"],
      ["focus", null, "daysTracked", consistency.daysTracked, null],
      ["focus", null, "activeDays", consistency.activeDays, null],
      ["focus", null, "consistencyRate", consistency.consistencyRate, "percent"],
      ["focus", null, "averageFocusMinutesOnActiveDays", consistency.averageFocusMinutesOnActiveDays, "minutes"],
      [
        "focus",
        consistency.bestFocusDay?.date ?? null,
        "bestFocusDay",
        consistency.bestFocusDay?.focusMinutes ?? null,
        "focus minutes"
      ],
      ...recommendations.map((recommendation, index) => [
        "recommendation",
        null,
        `nextBestMove${index + 1}`,
        recommendation,
        null
      ]),
      ...heatmap.map((day) => [
        "daily",
        day.date,
        "activity",
        day.completedQuests,
        `${day.focusMinutes} focus minutes / ${day.xpGained} XP`
      ])
    ];

    downloadCsv("levelupx-analytics-export.csv", csvLines);
  }

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Analytics" title="Progress analytics">
      {error && <Notice tone="error">{error}</Notice>}

      <section className="mb-4 rounded-lg bg-ink p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-mint">Weekly window</p>
            <h2 className="mt-1 text-xl font-bold">{formatRange(summary.from, summary.to)}</h2>
          </div>
          <BarChart3 className="text-white/75" size={28} />
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-ink transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={exportAnalytics}
            type="button"
          >
            <Download size={17} />
            Export CSV
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard icon={CheckCircle2} iconClass="text-mint" label="Completed" metric={summary.completedQuests} />
        <StatCard icon={XCircle} iconClass="text-ember" label="Failed" metric={summary.failedQuests} />
        <StatCard icon={Sparkles} iconClass="text-violet" label="XP gained" metric={summary.xpGained} />
        <StatCard icon={Clock} iconClass="text-mint" label="Focus minutes" metric={summary.focusMinutes} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <PagePanel>
          <PanelTitle icon={BarChart3} iconClass="bg-violet/12 text-violet" title="Weekly shape">
            <SupportingText>A quick scan of outcome, effort, and XP movement.</SupportingText>
          </PanelTitle>

          <div className="mt-5 h-72 rounded-lg bg-paper p-3">
            {loading ? (
              <StateText surface="white">Loading weekly chart...</StateText>
            ) : (
              <WeeklyBarChart series={weeklyChart} />
            )}
          </div>

          <div className="mt-5 rounded-lg bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink/60">Completion rate</p>
              <p className="text-sm font-bold text-ink">{summary.completionRate}%</p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-mint" style={{ width: `${summary.completionRate}%` }} />
            </div>
          </div>
        </PagePanel>

        <PagePanel>
          <PanelTitle icon={Lightbulb} iconClass="bg-ember/12 text-ember" title="Next best moves">
            <SupportingText>
              {meta.providerSource} / {meta.promptVersion}
              {meta.usedFallback ? " / fallback" : ""}
            </SupportingText>
          </PanelTitle>

          <div className="mt-5 grid gap-3">
            {loading ? (
              <StateText>Loading recommendations...</StateText>
            ) : recommendations.length === 0 ? (
              <StateText>No recommendations available yet.</StateText>
            ) : (
              recommendations.map((recommendation, index) => (
                <div className="flex gap-3 rounded-lg border border-ink/8 p-4" key={recommendation}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-mint/10 text-sm font-bold text-mint">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-ink/65">{recommendation}</p>
                </div>
              ))
            )}
          </div>
          <p className="mt-4 rounded-md bg-paper px-3 py-2 text-sm font-semibold text-ink/55">
            Generated in {meta.durationMs}ms via {meta.providerSource}.
          </p>
        </PagePanel>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PagePanel>
          <PanelHeader>
            <div>
              <SectionHeading>Monthly activity</SectionHeading>
              <SupportingText spaced>Each square blends quest, focus, and XP activity for one day.</SupportingText>
            </div>
            <PanelTag>
              {monthlyActivity.completedQuests} quests / {monthlyActivity.focusMinutes} min
            </PanelTag>
          </PanelHeader>

          <div className="mt-5 grid grid-cols-10 gap-2">
            {loading ? (
              <StateText wide>Loading heatmap...</StateText>
            ) : heatmap.length === 0 ? (
              <StateText wide>No monthly activity yet.</StateText>
            ) : (
              heatmap.map((day) => (
                <div
                  className={clsx("aspect-square rounded-md border border-ink/8", activityLevel(day, maxActivity))}
                  key={day.date}
                  title={`${formatDate(day.date)}: ${day.completedQuests} quests, ${day.focusMinutes} focus minutes, ${day.xpGained} XP`}
                />
              ))
            )}
          </div>

          <div className="mt-5 h-72 rounded-lg bg-paper p-3">
            {loading ? (
              <StateText surface="white">Loading activity trend...</StateText>
            ) : heatmapTrend.length === 0 ? (
              <StateText surface="white">No activity trend yet.</StateText>
            ) : (
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={heatmapTrend} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
                  <CartesianGrid stroke="#e8e3d8" strokeDasharray="4 4" />
                  <XAxis dataKey="date" fontSize={11} interval="preserveStartEnd" stroke="#716a60" tickLine={false} />
                  <YAxis fontSize={12} stroke="#716a60" tickLine={false} width={42} />
                  <Tooltip
                    contentStyle={{ border: "0", borderRadius: "8px", boxShadow: "0 10px 30px rgba(25, 20, 15, 0.12)" }}
                    labelStyle={{ color: "#1d1a16", fontWeight: 700 }}
                  />
                  <Line dataKey="completedQuests" dot={false} name="Quests" stroke="#16a34a" strokeWidth={2} type="monotone" />
                  <Line dataKey="focusMinutes" dot={false} name="Focus min" stroke="#f97316" strokeWidth={2} type="monotone" />
                  <Line dataKey="xpGained" dot={false} name="XP" stroke="#7c3aed" strokeWidth={2} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SmallMetric label="30-day quests" metric={monthlyActivity.completedQuests} />
            <SmallMetric label="30-day focus" metric={monthlyActivity.focusMinutes} />
            <SmallMetric label="30-day XP" metric={monthlyActivity.xpGained} />
          </div>

          <div className="mt-5 rounded-lg bg-paper p-4">
            <div className="mb-3 flex items-center gap-2">
              <Target className="text-violet" size={18} />
              <p className="text-sm font-semibold text-ink/60">Strongest activity days</p>
            </div>
            <div className="h-64 rounded-lg bg-white p-3">
              {loading ? (
                <StateText surface="white">Loading top days...</StateText>
              ) : topDays.length === 0 || topDays.every((day) => day.score === 0) ? (
                <StateText surface="white">No ranked activity days yet.</StateText>
              ) : (
                <TopDaysBarChart days={topDays} />
              )}
            </div>
          </div>
        </PagePanel>

        <PagePanel>
          <PanelTitle icon={Flame} iconClass="bg-mint/12 text-mint" title="Focus consistency">
            <SupportingText>Measured across the same 30-day window.</SupportingText>
          </PanelTitle>

          <div className="mt-5 space-y-3">
            <SmallMetric label="Consistency rate" large metric={`${consistency.consistencyRate}%`} />
            <SmallMetric label="Active days" large metric={`${consistency.activeDays}/${consistency.daysTracked}`} />
            <SmallMetric label="Average active-day focus" large metric={`${consistency.averageFocusMinutesOnActiveDays} min`} />
            <div className="rounded-lg border border-mint/20 bg-mint/5 p-4">
              <p className="text-sm font-semibold text-mint">Best focus day</p>
              {consistency.bestFocusDay ? (
                <p className="mt-2 text-sm leading-6 text-ink/65">
                  {formatDate(consistency.bestFocusDay.date)} with {consistency.bestFocusDay.focusMinutes} focus minutes.
                </p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-ink/65">No focus day has been recorded yet.</p>
              )}
            </div>
          </div>
        </PagePanel>
      </section>
    </AppShell>
  );
}

function WeeklyBarChart({
  series
}: {
  series: { label: string; value: number; fill: string; suffix: string }[];
}) {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <BarChart data={series} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
        <CartesianGrid stroke="#e8e3d8" strokeDasharray="4 4" />
        <XAxis dataKey="label" fontSize={12} stroke="#716a60" tickLine={false} />
        <YAxis fontSize={12} stroke="#716a60" tickLine={false} width={42} />
        <Tooltip
          contentStyle={{ border: "0", borderRadius: "8px", boxShadow: "0 10px 30px rgba(25, 20, 15, 0.12)" }}
          formatter={(metric, _name, chartPoint) => {
            const chartMeta = chartPoint.payload as { suffix?: string };
            return [`${metric} ${chartMeta.suffix ?? ""}`, "Value"];
          }}
          labelStyle={{ color: "#1d1a16", fontWeight: 700 }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {series.map((bar) => (
            <Cell fill={bar.fill} key={bar.label} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopDaysBarChart({ days }: { days: (HeatmapDay & { label: string; score: number })[] }) {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <BarChart data={days} layout="vertical" margin={{ bottom: 8, left: 12, right: 18, top: 8 }}>
        <CartesianGrid stroke="#e8e3d8" strokeDasharray="4 4" />
        <XAxis fontSize={12} stroke="#716a60" tickLine={false} type="number" />
        <YAxis dataKey="label" fontSize={12} stroke="#716a60" tickLine={false} type="category" width={72} />
        <Tooltip
          contentStyle={{ border: "0", borderRadius: "8px", boxShadow: "0 10px 30px rgba(25, 20, 15, 0.12)" }}
          formatter={(score) => [`${score} score`, "Activity"]}
          labelStyle={{ color: "#1d1a16", fontWeight: 700 }}
        />
        <Bar dataKey="score" fill="#7c3aed" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
