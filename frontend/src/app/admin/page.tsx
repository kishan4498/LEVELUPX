"use client";

import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip
} from "chart.js";
import clsx from "clsx";
import {
  Activity,
  Ban,
  BarChart3,
  CheckCircle2,
  Coins,
  Download,
  ExternalLink,
  FileText,
  FileWarning,
  Flag,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  RefreshCw,
  UserRound,
  UsersRound
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AbuseEvidence } from "@/components/abuse/AbuseEvidence";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { EmptyPanelMessage, MetaLabel, PageSection, PanelHeader, PanelTag, PanelTop, RouteFallback, SectionHeading, SupportingText, TableMessage } from "@/components/ui/PagePrimitives";
import { StatCard } from "@/components/ui/StatCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiDownload, apiRequest, errorMessage } from "@/lib/api";
import type {
  AdminAbuseReport,
  AdminAbuseSeverity,
  AdminAbuseStatus,
  AdminAction,
  AdminAnalytics,
  AdminDashboard,
  AdminEconomySettings,
  AdminMarketplaceListing,
  AdminProductFunnel,
  AdminReport,
  AdminSystemHealth,
  AdminUser,
  AdminUserRole,
  AdminUserStatus
} from "@/types/admin";

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Filler, Legend, ChartTooltip);

const emptyDashboard: AdminDashboard = {
  users: {
    total: 0,
    active: 0,
    banned: 0,
    suspended: 0
  },
  abuseReports: {
    open: 0,
    critical: 0
  }
};

const statusOptions: AdminUserStatus[] = ["ACTIVE", "SUSPENDED", "BANNED"];
const roleOptions: AdminUserRole[] = ["USER", "ADMIN", "SUPER_ADMIN"];
const abuseStatusOptions: AdminAbuseStatus[] = ["OPEN", "REVIEWED", "ACTION_TAKEN", "DISMISSED"];
type AnalyticsExportFormat = "csv" | "pdf";

const emptyEconomySettings: AdminEconomySettings = {
  id: "",
  xpMultiplier: 1,
  coinMultiplier: 1,
  dailyCoinLimit: 500,
  maxQuestReward: 1000,
  inflationRate: 0,
  updatedBy: null,
  updatedAt: ""
};

const emptyAnalytics: AdminAnalytics = {
  activeUsersLast7Days: 0,
  xpGeneratedLast30Days: 0,
  coinInflationLast30Days: {
    earned: 0,
    spent: 0,
    net: 0
  },
  rewardSourcesLast30Days: [],
  coinFlowByTypeLast30Days: [],
  economySafeguards: [],
  abuseReports: {
    open: 0,
    reviewed: 0,
    actionTaken: 0,
    dismissed: 0
  },
  mostActiveGuilds: []
};

const emptySystemHealth: AdminSystemHealth = {
  service: "levelupx-api",
  status: "OK",
  releaseVersion: null,
  uptimeSeconds: 0,
  timestamp: "",
  runtime: {
    nodeVersion: "",
    environment: "development",
    memoryRssMb: 0,
    memoryHeapUsedMb: 0,
    memoryHeapTotalMb: 0
  },
  readiness: {
    database: "missing-url",
    metrics: "disabled",
    prometheus: "disabled",
    redis: "disabled",
    backgroundJobs: "manual-runner"
  },
  observability: {
    status: "disabled",
    message: "Prometheus monitoring is disabled.",
    targetUp: null,
    fiveMinuteRequests: null,
    errorRatePercent: null,
    p95LatencyMs: null,
    requestRateHistory: [],
    activeAlerts: [],
    links: {
      prometheus: null,
      grafana: null,
      alertmanager: null
    },
    sampledAt: ""
  },
  apiRequests: {
    totalRecentRequests: 0,
    errorRequests: 0,
    clientErrorRequests: 0,
    averageDurationMs: 0,
    recentRequests: []
  },
  security: {
    adminTwoStepRequired: true,
    tokenDbRecheckEnabled: true,
    staleTokenInvalidationEnabled: true,
    superAdminMonitoringOnly: true
  }
};

const emptyProductFunnel: AdminProductFunnel = {
  from: "",
  to: "",
  steps: []
};

function toEconomyForm(settings: AdminEconomySettings) {
  return {
    xpMultiplier: String(settings.xpMultiplier),
    coinMultiplier: String(settings.coinMultiplier),
    dailyCoinLimit: String(settings.dailyCoinLimit),
    maxQuestReward: String(settings.maxQuestReward),
    inflationRate: String(settings.inflationRate)
  };
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(date));
}

function statusClass(status: AdminUserStatus) {
  if (status === "ACTIVE") {
    return "bg-mint/10 text-mint";
  }

  if (status === "SUSPENDED") {
    return "bg-ember/10 text-ember";
  }

  return "bg-ink/10 text-ink";
}

function abuseStatusClass(status: AdminAbuseStatus) {
  if (status === "OPEN") {
    return "bg-ember/10 text-ember";
  }

  if (status === "ACTION_TAKEN") {
    return "bg-violet/12 text-violet";
  }

  if (status === "DISMISSED") {
    return "bg-ink/8 text-ink/55";
  }

  return "bg-mint/10 text-mint";
}

function severityClass(severity: AdminAbuseSeverity) {
  if (severity === "CRITICAL") {
    return "bg-ink text-white";
  }

  if (severity === "HIGH") {
    return "bg-ember/12 text-ember";
  }

  if (severity === "MEDIUM") {
    return "bg-violet/12 text-violet";
  }

  return "bg-mint/10 text-mint";
}

function marketplaceStatusClass(status: AdminMarketplaceListing["status"]) {
  if (status === "ACTIVE") {
    return "bg-mint/10 text-mint";
  }

  if (status === "SOLD") {
    return "bg-violet/12 text-violet";
  }

  return "bg-ink/8 text-ink/55";
}

function safeguardClass(level: "OK" | "WATCH" | "RISK") {
  if (level === "RISK") {
    return "bg-ember/10 text-ember";
  }

  if (level === "WATCH") {
    return "bg-violet/12 text-violet";
  }

  return "bg-mint/10 text-mint";
}

function observabilityClass(status: AdminSystemHealth["observability"]["status"]) {
  if (status === "ready") {
    return "bg-mint/10 text-mint";
  }

  if (status === "degraded") {
    return "bg-violet/12 text-violet";
  }

  return status === "disabled" ? "bg-ink/6 text-ink/55" : "bg-ember/10 text-ember";
}

function labelize(label: string) {
  return label
    .toLowerCase()
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }

  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

function summarizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "No metadata";
  }

  const fields = Object.entries(metadata)
    .slice(0, 3)
    .map(([key, entryValue]) => `${labelize(key)}: ${String(entryValue)}`);

  return fields.length > 0 ? fields.join(" / ") : "No metadata";
}

function formatMonitoringTime(sampledAt: string) {
  const timestamp = new Date(sampledAt);

  if (!sampledAt || Number.isNaN(timestamp.getTime())) {
    return "Not sampled";
  }

  return timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTime(startedAt: string | null) {
  if (!startedAt) {
    return "Unknown start time";
  }

  const timestamp = new Date(startedAt);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown start time";
  }

  return timestamp.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function HealthTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-paper px-3 py-3">
      <MetricLabel>{label}</MetricLabel>
      <p className="mt-1 text-sm font-semibold">{children}</p>
    </div>
  );
}

function MetricLabel({ children }: { children: ReactNode }) {
  return <MetaLabel>{children}</MetaLabel>;
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-bold">{children}</h3>;
}

function DetailPanel({
  children,
  spaced = false,
  minWidth = false
}: {
  children: ReactNode;
  spaced?: boolean;
  minWidth?: boolean;
}) {
  return (
    <div className={clsx(spaced && "mt-5", minWidth && "min-w-0", "rounded-lg border border-ink/8 p-4")}>
      {children}
    </div>
  );
}

function MonitorLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink/65 transition hover:border-ink/20 hover:text-ink"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
      <ExternalLink size={14} />
    </a>
  );
}

function SecurityBadge({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "w-fit rounded-md px-2 py-1 text-xs font-semibold",
        enabled ? "bg-mint/10 text-mint" : "bg-ember/10 text-ember"
      )}
    >
      {children}
    </span>
  );
}

function PanelIntro({
  icon: Icon,
  iconClass,
  title,
  children
}: {
  icon: typeof Activity;
  iconClass: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className={clsx("mb-3 flex h-10 w-10 items-center justify-center rounded-md", iconClass)}>
        <Icon size={20} />
      </div>
      <SectionHeading>{title}</SectionHeading>
      <SupportingText spaced>{children}</SupportingText>
    </div>
  );
}

function AnalyticsTile({
  icon: Icon,
  iconClass,
  label,
  metric
}: {
  icon: typeof Activity;
  iconClass: string;
  label: string;
  metric: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-paper p-4">
      <Icon className={clsx("mb-3", iconClass)} size={20} />
      <SupportingText>{label}</SupportingText>
      <p className="mt-1 text-2xl font-bold">{metric}</p>
    </div>
  );
}

function SummaryTile({
  label,
  metric,
  panelClass,
  labelClass
}: {
  label: string;
  metric: ReactNode;
  panelClass: string;
  labelClass: string;
}) {
  return (
    <div className={clsx("rounded-md", panelClass, "p-3")}>
      <p className={clsx("text-sm", labelClass)}>{label}</p>
      <p className="mt-1 text-xl font-bold">{metric}</p>
    </div>
  );
}

function RewardSourcesPanel({ sources }: { sources: AdminAnalytics["rewardSourcesLast30Days"] }) {
  return (
    <DetailPanel minWidth>
      <div className="flex items-center gap-3">
        <Sparkles className="text-violet" size={20} />
        <PanelTitle>Reward sources</PanelTitle>
      </div>
      <div className="mt-4 min-w-0 max-w-full overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="grid grid-cols-[1fr_100px_100px] rounded-md bg-paper px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
            <span>Source</span>
            <span className="text-right">XP</span>
            <span className="text-right">Coins</span>
          </div>
          {sources.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink/55">No reward source activity yet.</p>
          ) : (
            sources.map((source) => (
              <div
                className="grid grid-cols-[1fr_100px_100px] border-b border-ink/8 px-3 py-3 text-sm last:border-b-0"
                key={source.sourceType}
              >
                <span className="font-semibold">{labelize(source.sourceType)}</span>
                <span className="text-right text-ink/65">{source.xp}</span>
                <span className="text-right text-ink/65">{source.coins}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </DetailPanel>
  );
}

function ProductFunnelStep({
  step,
  index,
  firstStepUsers
}: {
  step: AdminProductFunnel["steps"][number];
  index: number;
  firstStepUsers: number;
}) {
  const width = firstStepUsers > 0 ? Math.max(5, Math.min(100, (step.uniqueUsers / firstStepUsers) * 100)) : 0;

  return (
    <article className="border-l-2 border-sky pl-4">
      <p className="text-xs font-bold text-ink/45">{index + 1}. {labelize(step.name)}</p>
      <p className="mt-2 text-2xl font-bold">{step.uniqueUsers}</p>
      <p className="mt-1 text-xs text-ink/45">{step.events} events</p>
      <div className="mt-3 h-2 overflow-hidden rounded-md bg-line">
        <div className="h-full rounded-md bg-sky" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-xs font-semibold text-violet">
        {step.conversionFromPrevious === null ? "Entry step" : `${step.conversionFromPrevious}% from previous`}
      </p>
    </article>
  );
}

function RequestRateChart({ history }: { history: AdminSystemHealth["observability"]["requestRateHistory"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || history.length === 0) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: history.map((sample) => sample.timestamp),
        datasets: [
          {
            label: "Requests per minute",
            data: history.map((sample) => sample.requestsPerMinute),
            borderColor: "#4a78d0",
            backgroundColor: "rgba(74, 120, 208, 0.12)",
            borderWidth: 2.5,
            fill: true,
            pointRadius: 0,
            pointHitRadius: 12,
            tension: 0.28
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion ? false : { duration: 320 },
        interaction: {
          intersect: false,
          mode: "index"
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => `${Number(context.parsed.y ?? 0).toFixed(2)} req/min`,
              title: (items) => formatDateTime(String(items[0]?.label ?? ""))
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: "#716a60",
              maxTicksLimit: 6,
              callback: (_value, index) => formatMonitoringTime(history[index]?.timestamp ?? "")
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "#e8e3d8"
            },
            ticks: {
              color: "#716a60"
            }
          }
        }
      }
    });

    return () => chart.destroy();
  }, [history]);

  const latest = history.at(-1)?.requestsPerMinute ?? 0;

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-ink/60">Request rate, last hour</p>
      <div className="mt-3 h-56 rounded-md bg-paper p-3">
        {history.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-ink/50">
            Historical request samples are not available yet.
          </div>
        ) : (
          <>
            <canvas
              aria-describedby="request-rate-summary"
              aria-label="Line chart of API requests per minute over the last hour"
              ref={canvasRef}
              role="img"
            />
            <p className="sr-only" id="request-rate-summary">
              Latest observed request rate: {latest.toFixed(2)} requests per minute.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ActiveAlerts({ alerts }: { alerts: AdminSystemHealth["observability"]["activeAlerts"] }) {
  return (
    <div className="min-w-0 lg:border-l lg:border-ink/8 lg:pl-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink/60">Active alerts</p>
        <span className="text-sm font-bold">{alerts.length}</span>
      </div>
      <div className="mt-3 grid gap-3">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-mint/8 px-3 py-3 text-sm font-semibold text-mint">
            <CheckCircle2 size={16} />
            No active Prometheus alerts
          </div>
        ) : (
          alerts.map((alert) => {
            const critical = alert.severity.toLowerCase() === "critical";

            return (
              <article
                className={clsx("border-l-2 pl-3", critical ? "border-ember" : "border-violet")}
                key={`${alert.name}-${alert.activeAt ?? alert.state}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words text-sm font-bold">{alert.name}</p>
                  <span
                    className={clsx(
                      "rounded-md px-2 py-0.5 text-xs font-semibold",
                      critical ? "bg-ember/10 text-ember" : "bg-violet/12 text-violet"
                    )}
                  >
                    {labelize(alert.severity)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink/65">{alert.summary}</p>
                <p className="mt-1 text-xs text-ink/45">
                  {labelize(alert.state)} since {formatDateTime(alert.activeAt)}
                </p>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

type AdminTableLayout = "audit" | "reports" | "users" | "marketplace";

const adminTableWidth = {
  audit: "min-w-[940px]",
  reports: "min-w-[900px]",
  users: "min-w-[980px]",
  marketplace: "min-w-[980px]"
} as const;

const adminTableGrid = {
  audit: {
    header: "grid grid-cols-[190px_170px_150px_1fr_150px] bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50",
    row: "grid grid-cols-[190px_170px_150px_1fr_150px] items-center gap-3 border-t border-ink/8 px-4 py-4 text-sm"
  },
  reports: {
    header: "grid grid-cols-[1fr_90px_120px_140px_150px_140px] bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50",
    row: "grid grid-cols-[1fr_90px_120px_140px_150px_140px] items-center gap-3 border-t border-ink/8 px-4 py-4 text-sm"
  },
  users: {
    header: "grid grid-cols-[1fr_170px_120px_140px_240px] bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50",
    row: "grid grid-cols-[1fr_170px_120px_140px_240px] items-center gap-3 border-t border-ink/8 px-4 py-4 text-sm"
  },
  marketplace: {
    header: "grid grid-cols-[1.2fr_150px_110px_110px_150px_130px] bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50",
    row: "grid grid-cols-[1.2fr_150px_110px_110px_150px_130px] items-center gap-3 border-t border-ink/8 px-4 py-4 text-sm"
  }
} as const;

function AdminTable({ layout, children }: { layout: AdminTableLayout; children: ReactNode }) {
  return (
    <div className="mt-5 min-w-0 max-w-full overflow-x-auto rounded-lg border border-ink/8">
      <div className={adminTableWidth[layout]}>{children}</div>
    </div>
  );
}

function AdminTableGrid({
  layout,
  header = false,
  children
}: {
  layout: AdminTableLayout;
  header?: boolean;
  children: ReactNode;
}) {
  return <div className={adminTableGrid[layout][header ? "header" : "row"]}>{children}</div>;
}

function ReportTableRow({
  report,
  downloadId,
  onDownload
}: {
  report: AdminReport;
  downloadId: string | null;
  onDownload: (report: AdminReport) => Promise<void>;
}) {
  return (
    <AdminTableGrid layout="reports">
      <div className="min-w-0">
        <p className="truncate font-semibold">{labelize(report.reportType)}</p>
        <p className="mt-1 truncate text-xs text-ink/50">{report.filename}</p>
      </div>
      <span
        className={clsx(
          "w-fit rounded-md px-2 py-1 text-xs font-semibold",
          report.format === "PDF" ? "bg-ember/10 text-ember" : "bg-mint/10 text-mint"
        )}
      >
        {report.format}
      </span>
      <span className="font-semibold text-ink/65">{formatBytes(report.sizeBytes)}</span>
      <span className="truncate text-ink/65">{report.generatedBy.name}</span>
      <span className="text-ink/55">{formatDate(report.createdAt)}</span>
      <div className="flex justify-end">
        {report.storageKey ? (
          <Button
            disabled={downloadId === report.id}
            onClick={() => void onDownload(report)}
            type="button"
            variant="ghost"
          >
            <Download size={16} />
            {downloadId === report.id ? "Downloading..." : "Download"}
          </Button>
        ) : (
          <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink/45">Metadata only</span>
        )}
      </div>
    </AdminTableGrid>
  );
}

function UserTableRow({
  account,
  viewerId,
  isSuperAdmin,
  pendingRole,
  pendingStatus,
  savingRoleId,
  savingUserId,
  onRoleChange,
  onStatusChange,
  onSaveRole,
  onSaveStatus
}: {
  account: AdminUser;
  viewerId: string;
  isSuperAdmin: boolean;
  pendingRole: AdminUserRole;
  pendingStatus: AdminUserStatus;
  savingRoleId: string | null;
  savingUserId: string | null;
  onRoleChange: (userId: string, role: AdminUserRole) => void;
  onStatusChange: (userId: string, status: AdminUserStatus) => void;
  onSaveRole: (account: AdminUser) => Promise<void>;
  onSaveStatus: (account: AdminUser) => Promise<void>;
}) {
  const isSelf = account.id === viewerId;
  const canEditRole = isSuperAdmin && !isSelf && !account.protectedRoot;
  const promotingToAdmin = pendingRole === "ADMIN" || pendingRole === "SUPER_ADMIN";
  const roleSaveBlocked = promotingToAdmin && (!account.emailVerifiedAt || !account.twoStepEnabled);
  const canEditStatus = !isSelf && !account.protectedRoot;

  return (
    <AdminTableGrid layout="users">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <UserRound className="shrink-0 text-ink/35" size={17} />
          <p className="truncate font-semibold">{account.name}</p>
        </div>
        <p className="mt-1 truncate text-xs text-ink/50">
          {account.email} / joined {formatDate(account.createdAt)}
        </p>
        {account.protectedRoot && (
          <p className="mt-1 w-fit rounded-md bg-mint/10 px-2 py-1 text-xs font-semibold text-mint">
            Permanent root admin
          </p>
        )}
      </div>
      {canEditRole ? (
        <select
          className="h-10 rounded-md border border-ink/10 bg-paper px-2 text-sm font-semibold text-ink/70 outline-none transition focus:border-ink/35 focus:ring-2 focus:ring-ink/10"
          disabled={savingRoleId === account.id}
          onChange={(event) => onRoleChange(account.id, event.target.value as AdminUserRole)}
          value={pendingRole}
        >
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      ) : (
        <span className="inline-flex w-fit items-center gap-2 rounded-md bg-paper px-2 py-1 font-semibold text-ink/60">
          {account.role === "USER" ? <UserRound size={15} /> : <ShieldCheck size={15} />}
          {account.role}
        </span>
      )}
      <div className="grid gap-1">
        <SecurityBadge enabled={Boolean(account.emailVerifiedAt)}>
          {account.emailVerifiedAt ? "Email verified" : "Email required"}
        </SecurityBadge>
        <SecurityBadge enabled={account.twoStepEnabled}>
          {account.twoStepEnabled ? "2-step enabled" : "2-step required"}
        </SecurityBadge>
      </div>
      <select
        className={clsx(
          "h-10 rounded-md border border-ink/10 px-2 text-sm font-semibold outline-none transition focus:border-ink/35 focus:ring-2 focus:ring-ink/10",
          statusClass(pendingStatus)
        )}
        disabled={!canEditStatus || savingUserId === account.id}
        onChange={(event) => onStatusChange(account.id, event.target.value as AdminUserStatus)}
        value={pendingStatus}
      >
        {statusOptions.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-2">
        {isSuperAdmin && (
          <Button
            disabled={!canEditRole || savingRoleId === account.id || pendingRole === account.role || roleSaveBlocked}
            onClick={() => void onSaveRole(account)}
            type="button"
            variant="ghost"
          >
            Save role
          </Button>
        )}
        <Button
          disabled={!canEditStatus || savingUserId === account.id || pendingStatus === account.status}
          onClick={() => void onSaveStatus(account)}
          type="button"
          variant="ghost"
        >
          Save status
        </Button>
      </div>
    </AdminTableGrid>
  );
}

function AbuseReportCard({
  report,
  pendingStatus,
  savingReportId,
  onStatusChange,
  onSave
}: {
  report: AdminAbuseReport;
  pendingStatus: AdminAbuseStatus;
  savingReportId: string | null;
  onStatusChange: (reportId: string, status: AdminAbuseStatus) => void;
  onSave: (report: AdminAbuseReport) => Promise<void>;
}) {
  return (
    <article className="rounded-lg border border-ink/8 p-5">
      <PanelTop>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileWarning className="text-ember" size={18} />
            <PanelTitle>{report.userName}</PanelTitle>
            <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", severityClass(report.severity))}>
              {report.severity}
            </span>
            <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", abuseStatusClass(report.status))}>
              {report.status}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/65">{report.reason}</p>
          <AbuseEvidence metadata={report.metadata} />
          <p className="mt-3 text-sm text-ink/45">
            User ID {report.userId} / reported {formatDate(report.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-2 text-sm font-medium text-ink" htmlFor={`report-${report.id}`}>
            <span>Status</span>
            <select
              className={clsx(
                "h-10 rounded-md border border-ink/10 px-2 text-sm font-semibold outline-none transition focus:border-ink/35 focus:ring-2 focus:ring-ink/10",
                abuseStatusClass(pendingStatus)
              )}
              disabled={savingReportId === report.id}
              id={`report-${report.id}`}
              onChange={(event) => onStatusChange(report.id, event.target.value as AdminAbuseStatus)}
              value={pendingStatus}
            >
              {abuseStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={savingReportId === report.id || pendingStatus === report.status}
            onClick={() => void onSave(report)}
            type="button"
            variant="ghost"
          >
            Save
          </Button>
        </div>
      </PanelTop>
    </article>
  );
}

function replaceUser(users: AdminUser[], targetUserId: string, savedUser: AdminUser) {
  return users.map((account) => (account.id === targetUserId ? savedUser : account));
}

function replaceAbuseReport(reports: AdminAbuseReport[], targetReportId: string, savedReport: AdminAbuseReport) {
  return reports.map((report) => (report.id === targetReportId ? savedReport : report));
}

function replaceListing(listings: AdminMarketplaceListing[], targetListingId: string, cancelledListing: AdminMarketplaceListing) {
  return listings.map((listing) => (listing.id === targetListingId ? cancelledListing : listing));
}

export default function AdminPage() {
  const { accessToken, user } = useRequireAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard>(emptyDashboard);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [abuseReports, setAbuseReports] = useState<AdminAbuseReport[]>([]);
  const [economySettings, setEconomySettings] = useState<AdminEconomySettings>(emptyEconomySettings);
  const [analytics, setAnalytics] = useState<AdminAnalytics>(emptyAnalytics);
  const [adminReports, setAdminReports] = useState<AdminReport[]>([]);
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [marketplaceListings, setMarketplaceListings] = useState<AdminMarketplaceListing[]>([]);
  const [productFunnel, setProductFunnel] = useState<AdminProductFunnel>(emptyProductFunnel);
  const [systemHealth, setSystemHealth] = useState<AdminSystemHealth>(emptySystemHealth);
  const [economyForm, setEconomyForm] = useState(() => toEconomyForm(emptyEconomySettings));
  const [statuses, setStatuses] = useState<Record<string, AdminUserStatus>>({});
  const [roles, setRoles] = useState<Record<string, AdminUserRole>>({});
  const [reportStatuses, setReportStatuses] = useState<Record<string, AdminAbuseStatus>>({});
  const [loading, setLoading] = useState(true);
  const [savingEconomy, setSavingEconomy] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [savingReportId, setSavingReportId] = useState<string | null>(null);
  const [savingListingId, setSavingListingId] = useState<string | null>(null);
  const [analyticsExport, setAnalyticsExport] = useState<AnalyticsExportFormat | null>(null);
  const [tradeExport, setTradeExport] = useState<AnalyticsExportFormat | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const adminCount = users.filter((account) => account.role === "ADMIN" || account.role === "SUPER_ADMIN").length;
  const criticalCount = abuseReports.filter((report) => report.severity === "CRITICAL" && report.status === "OPEN").length;

  const loadData = useCallback(async () => {
    if (!accessToken || !isAdmin) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [dashboardRes, userRes, abuseRes, economyRes, analyticsRes, reportRes, actionRes, marketRes, funnelRes, healthRes] = await Promise.all([
        apiRequest<{ dashboard: AdminDashboard }>("/admin/dashboard"),
        apiRequest<{ users: AdminUser[] }>("/admin/users"),
        apiRequest<{ reports: AdminAbuseReport[] }>("/admin/abuse-reports"),
        apiRequest<{ settings: AdminEconomySettings }>("/admin/economy"),
        apiRequest<{ analytics: AdminAnalytics }>("/admin/analytics"),
        apiRequest<{ reports: AdminReport[] }>("/admin/reports"),
        apiRequest<{ actions: AdminAction[] }>("/admin/audit-actions"),
        apiRequest<{ listings: AdminMarketplaceListing[] }>("/admin/marketplace/listings"),
        apiRequest<{ funnel: AdminProductFunnel }>("/product-events/funnel"),
        isSuperAdmin
          ? apiRequest<{ health: AdminSystemHealth }>("/admin/system-health")
          : Promise.resolve({ health: emptySystemHealth })
      ]);

      setDashboard(dashboardRes.dashboard);
      setUsers(userRes.users);
      setAbuseReports(abuseRes.reports);
      setEconomySettings(economyRes.settings);
      setAnalytics(analyticsRes.analytics);
      setAdminReports(reportRes.reports);
      setAdminActions(actionRes.actions);
      setMarketplaceListings(marketRes.listings);
      setProductFunnel(funnelRes.funnel);
      setSystemHealth(healthRes.health);
      setEconomyForm(toEconomyForm(economyRes.settings));
      setStatuses(Object.fromEntries(userRes.users.map(({ id, status }) => [id, status])));
      setRoles(Object.fromEntries(userRes.users.map(({ id, role }) => [id, role])));
      setReportStatuses(Object.fromEntries(abuseRes.reports.map(({ id, status }) => [id, status])));
    } catch (err) {
      setError(errorMessage(err, "Could not load admin data"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdmin, isSuperAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshHealth = useCallback(
    async (reportFailure = true) => {
      if (!accessToken || !isSuperAdmin) {
        return;
      }

      setRefreshing(true);

      try {
        const { health: latestHealth } = await apiRequest<{ health: AdminSystemHealth }>("/admin/system-health");
        setSystemHealth(latestHealth);
      } catch (err) {
        if (reportFailure) {
          setError(errorMessage(err, "Could not refresh system health"));
        }
      } finally {
        setRefreshing(false);
      }
    },
    [accessToken, isSuperAdmin]
  );

  useEffect(() => {
    if (!accessToken || !isSuperAdmin) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshHealth(false);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [accessToken, isSuperAdmin, refreshHealth]);

  async function updateUserStatus(targetUser: AdminUser) {
    const nextStatus = statuses[targetUser.id];

    if (!nextStatus || nextStatus === targetUser.status) {
      return;
    }

    setSavingUserId(targetUser.id);
    setError(null);
    setNotice(null);

    try {
      const { user: savedUser } = await apiRequest<{ user: AdminUser }>(`/admin/users/${targetUser.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });

      setUsers((currentUsers) => replaceUser(currentUsers, targetUser.id, savedUser));
      setStatuses((currentStatuses) => ({ ...currentStatuses, [targetUser.id]: savedUser.status }));
      setNotice(`${savedUser.name} status updated.`);
      await loadData();
    } catch (err) {
      setError(errorMessage(err, "Could not update user status"));
    } finally {
      setSavingUserId(null);
    }
  }

  async function updateUserRole(targetUser: AdminUser) {
    const nextRole = roles[targetUser.id];

    if (!nextRole || nextRole === targetUser.role) {
      return;
    }

    setSavingRoleId(targetUser.id);
    setError(null);
    setNotice(null);

    try {
      const { user: savedUser } = await apiRequest<{ user: AdminUser }>(`/admin/users/${targetUser.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });

      setUsers((currentUsers) => replaceUser(currentUsers, targetUser.id, savedUser));
      setRoles((currentRoles) => ({ ...currentRoles, [targetUser.id]: savedUser.role }));
      setNotice(`${savedUser.name} role updated.`);
      await loadData();
    } catch (err) {
      setError(errorMessage(err, "Could not update user role"));
    } finally {
      setSavingRoleId(null);
    }
  }

  async function updateAbuseReport(report: AdminAbuseReport) {
    const nextStatus = reportStatuses[report.id];

    if (!nextStatus || nextStatus === report.status) {
      return;
    }

    setSavingReportId(report.id);
    setError(null);
    setNotice(null);

    try {
      const { report: savedReport } = await apiRequest<{ report: AdminAbuseReport }>(`/admin/abuse-reports/${report.id}/action`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });

      setAbuseReports((currentReports) => replaceAbuseReport(currentReports, report.id, savedReport));
      setReportStatuses((currentStatuses) => ({ ...currentStatuses, [report.id]: savedReport.status }));
      setNotice("Abuse report updated.");
      await loadData();
    } catch (err) {
      setError(errorMessage(err, "Could not update abuse report"));
    } finally {
      setSavingReportId(null);
    }
  }

  async function cancelListing(listing: AdminMarketplaceListing) {
    setSavingListingId(listing.id);
    setError(null);
    setNotice(null);

    try {
      const { listing: cancelledListing } = await apiRequest<{ listing: AdminMarketplaceListing }>(`/admin/marketplace/listings/${listing.id}/cancel`, {
        method: "PATCH"
      });

      setMarketplaceListings((currentListings) => replaceListing(currentListings, listing.id, cancelledListing));
      setNotice(`${cancelledListing.cosmetic.name} listing cancelled.`);
      await loadData();
    } catch (err) {
      setError(errorMessage(err, "Could not cancel marketplace listing"));
    } finally {
      setSavingListingId(null);
    }
  }

  async function updateEconomySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSavingEconomy(true);
    setError(null);
    setNotice(null);

    try {
      const { settings: savedSettings } = await apiRequest<{ settings: AdminEconomySettings }>("/admin/economy/settings", {
        method: "PATCH",
        body: JSON.stringify({
          xpMultiplier: Number(economyForm.xpMultiplier),
          coinMultiplier: Number(economyForm.coinMultiplier),
          dailyCoinLimit: Number(economyForm.dailyCoinLimit),
          maxQuestReward: Number(economyForm.maxQuestReward),
          inflationRate: Number(economyForm.inflationRate)
        })
      });

      setEconomySettings(savedSettings);
      setEconomyForm(toEconomyForm(savedSettings));
      setNotice("Economy settings updated.");
    } catch (err) {
      setError(errorMessage(err, "Could not update economy settings"));
    } finally {
      setSavingEconomy(false);
    }
  }

  async function exportAnalytics(format: AnalyticsExportFormat) {
    setAnalyticsExport(format);
    setError(null);
    setNotice(null);

    try {
      const report = await apiDownload(`/admin/analytics/export?format=${format}`);
      downloadFile(report.blob, report.filename);
      setNotice(`Analytics ${format.toUpperCase()} export started.`);
      await loadData();
    } catch (err) {
      setError(errorMessage(err, "Could not export analytics"));
    } finally {
      setAnalyticsExport(null);
    }
  }

  async function exportTrades(format: AnalyticsExportFormat) {
    setTradeExport(format);
    setError(null);
    setNotice(null);

    try {
      const report = await apiDownload(`/admin/marketplace/trade-history/export?format=${format}`);
      downloadFile(report.blob, report.filename);
      setNotice(`Marketplace trade history ${format.toUpperCase()} export started.`);
      await loadData();
    } catch (err) {
      setError(errorMessage(err, "Could not export marketplace trade history"));
    } finally {
      setTradeExport(null);
    }
  }

  async function downloadReport(report: AdminReport) {
    if (!report.storageKey) {
      return;
    }

    setDownloadId(report.id);
    setError(null);
    setNotice(null);

    try {
      const storedReport = await apiDownload(`/admin/reports/${report.id}/download`);
      downloadFile(storedReport.blob, storedReport.filename);
      setNotice(`${report.filename} download started.`);
    } catch (err) {
      setError(errorMessage(err, "Could not download report"));
    } finally {
      setDownloadId(null);
    }
  }

  function changeUserRole(userId: string, role: AdminUserRole) {
    setRoles((currentRoles) => ({
      ...currentRoles,
      [userId]: role
    }));
  }

  function changeUserStatus(userId: string, status: AdminUserStatus) {
    setStatuses((currentStatuses) => ({
      ...currentStatuses,
      [userId]: status
    }));
  }

  function changeReportStatus(reportId: string, status: AdminAbuseStatus) {
    setReportStatuses((currentStatuses) => ({
      ...currentStatuses,
      [reportId]: status
    }));
  }

  if (!accessToken || !user) {
    return <RouteFallback />;
  }

  if (!isAdmin) {
    return (
      <AppShell eyebrow="Admin" title="Admin access">
        <PageSection flush>
          <ShieldAlert className="mb-4 text-ember" size={28} />
          <h2 className="text-xl font-bold">Admin role required</h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            This area is only available to ADMIN and SUPER_ADMIN accounts.
          </p>
        </PageSection>
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Admin" title="Admin control room">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={UsersRound}
          iconClass="text-violet"
          label="Total users"
          metric={dashboard.users.total}
        />
        <StatCard
          icon={CheckCircle2}
          iconClass="text-mint"
          label="Active users"
          metric={dashboard.users.active}
        />
        <StatCard
          icon={Ban}
          iconClass="text-ember"
          label="Restricted"
          metric={dashboard.users.banned + dashboard.users.suspended}
        />
        <StatCard
          icon={ShieldAlert}
          iconClass="text-ember"
          label="Open reports"
          metric={dashboard.abuseReports.open}
        />
      </section>

      <section className="mt-6 border-y border-line bg-white py-6 shadow-panel">
        <div className="px-5 sm:px-6">
          <PanelHeader>
            <PanelIntro icon={BarChart3} iconClass="bg-sky/10 text-sky" title="30-day product funnel">
              Unique users moving from onboarding into completed focus work.
            </PanelIntro>
            <span className="rounded-md bg-paper px-3 py-2 text-sm font-semibold text-ink/55">
              {productFunnel.from ? `${formatDate(productFunnel.from)} to ${formatDate(productFunnel.to)}` : "Awaiting events"}
            </span>
          </PanelHeader>

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {productFunnel.steps.map((step, index) => (
              <ProductFunnelStep
                firstStepUsers={productFunnel.steps[0]?.uniqueUsers ?? 0}
                index={index}
                key={step.name}
                step={step}
              />
            ))}
            {!loading && productFunnel.steps.length === 0 && (
              <p className="text-sm text-ink/50 lg:col-span-5">Product events will populate this funnel as users complete key actions.</p>
            )}
          </div>
        </div>
      </section>

      {isSuperAdmin && (
        <PageSection>
          <PanelTop>
            <PanelIntro icon={Activity} iconClass="bg-mint/12 text-mint" title="System health">
              Runtime status, historical API signals, active alerts, and admin security controls.
            </PanelIntro>
            <div className="flex items-center gap-2">
              <button
                aria-label="Refresh system health"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-paper text-ink/65 transition hover:border-ink/20 hover:text-ink disabled:cursor-wait disabled:opacity-55"
                disabled={refreshing}
                onClick={() => void refreshHealth()}
                title="Refresh system health"
                type="button"
              >
                <RefreshCw className={clsx(refreshing && "animate-spin")} size={17} />
              </button>
              <span className={clsx("rounded-md px-3 py-2 text-sm font-semibold", safeguardClass(systemHealth.status))}>
                {systemHealth.status}
              </span>
            </div>
          </PanelTop>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <HealthTile label="Uptime">{Math.floor(systemHealth.uptimeSeconds / 60)} min</HealthTile>
            <HealthTile label="Heap">{systemHealth.runtime.memoryHeapUsedMb} MB</HealthTile>
            <HealthTile label="API avg">{systemHealth.apiRequests.averageDurationMs} ms</HealthTile>
            <HealthTile label="Errors">
              {systemHealth.apiRequests.errorRequests} server / {systemHealth.apiRequests.clientErrorRequests} client
            </HealthTile>
          </div>

          <div className="mt-5 border-y border-ink/8 py-5">
            <PanelTop>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold">Historical telemetry</h3>
                  <span
                    className={clsx(
                      "rounded-md px-2 py-1 text-xs font-semibold",
                      observabilityClass(systemHealth.observability.status)
                    )}
                  >
                    {labelize(systemHealth.observability.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink/50">
                  Sampled {formatMonitoringTime(systemHealth.observability.sampledAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {systemHealth.observability.links.grafana && (
                  <MonitorLink href={systemHealth.observability.links.grafana}>Grafana</MonitorLink>
                )}
                {systemHealth.observability.links.prometheus && (
                  <MonitorLink href={systemHealth.observability.links.prometheus}>Prometheus</MonitorLink>
                )}
                {systemHealth.observability.links.alertmanager && (
                  <MonitorLink href={systemHealth.observability.links.alertmanager}>Alerts</MonitorLink>
                )}
              </div>
            </PanelTop>

            {systemHealth.observability.message && (
              <p className="mt-4 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink/60">
                {systemHealth.observability.message}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="border-l-2 border-mint pl-3">
                <MetricLabel>Scrape target</MetricLabel>
                <p
                  className={clsx(
                    "mt-1 text-lg font-bold",
                    systemHealth.observability.targetUp === false ? "text-ember" : "text-ink"
                  )}
                >
                  {systemHealth.observability.targetUp === null
                    ? "No data"
                    : systemHealth.observability.targetUp
                      ? "Up"
                      : "Down"}
                </p>
              </div>
              <div className="border-l-2 border-sky pl-3">
                <MetricLabel>Requests / 5 min</MetricLabel>
                <p className="mt-1 text-lg font-bold">
                  {systemHealth.observability.fiveMinuteRequests === null
                    ? "No data"
                    : systemHealth.observability.fiveMinuteRequests}
                </p>
              </div>
              <div className="border-l-2 border-violet pl-3">
                <MetricLabel>5xx error rate</MetricLabel>
                <p className="mt-1 text-lg font-bold">
                  {systemHealth.observability.errorRatePercent === null
                    ? "No data"
                    : `${systemHealth.observability.errorRatePercent}%`}
                </p>
              </div>
              <div className="border-l-2 border-ember pl-3">
                <MetricLabel>p95 latency</MetricLabel>
                <p className="mt-1 text-lg font-bold">
                  {systemHealth.observability.p95LatencyMs === null
                    ? "No data"
                    : `${systemHealth.observability.p95LatencyMs} ms`}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <RequestRateChart history={systemHealth.observability.requestRateHistory} />
              <ActiveAlerts alerts={systemHealth.observability.activeAlerts} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <DetailPanel>
              <p className="text-sm font-semibold text-ink/60">Readiness</p>
              <div className="mt-3 grid gap-2">
                {Object.entries(systemHealth.readiness).map(([key, readiness]) => (
                  <div className="flex items-center justify-between rounded-md bg-paper px-3 py-2 text-sm" key={key}>
                    <span className="font-semibold text-ink/60">{labelize(key)}</span>
                    <span className="font-semibold">{String(readiness)}</span>
                  </div>
                ))}
              </div>
            </DetailPanel>
            <DetailPanel>
              <p className="text-sm font-semibold text-ink/60">Recent API requests</p>
              <div className="mt-3 grid gap-2">
                {systemHealth.apiRequests.recentRequests.length === 0 ? (
                  <EmptyPanelMessage>No recent request samples yet.</EmptyPanelMessage>
                ) : (
                  systemHealth.apiRequests.recentRequests.slice(0, 5).map((request) => (
                    <div className="grid grid-cols-[70px_1fr_70px_80px] gap-2 rounded-md bg-paper px-3 py-2 text-xs" key={`${request.recordedAt}-${request.path}`}>
                      <span className="font-semibold">{request.method}</span>
                      <span className="truncate text-ink/60">{request.path}</span>
                      <span className="font-semibold">{request.statusCode}</span>
                      <span className="text-right text-ink/55">{request.durationMs}ms</span>
                    </div>
                  ))
                )}
              </div>
            </DetailPanel>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {Object.entries(systemHealth.security).map(([key, enabled]) => (
              <div className="rounded-md bg-paper px-3 py-3" key={key}>
                <MetricLabel>{labelize(key)}</MetricLabel>
                <p className="mt-1 text-sm font-semibold">{enabled ? "Enabled" : "Disabled"}</p>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      <PageSection>
        <PanelHeader>
          <PanelIntro icon={ScrollText} iconClass="bg-violet/12 text-violet" title="Audit history">
            Recent admin actions with actor, target, and recorded metadata.
          </PanelIntro>
          <PanelTag>
            {adminActions.length} actions
          </PanelTag>
        </PanelHeader>

        <AdminTable layout="audit">
            <AdminTableGrid header layout="audit">
              <span>Actor</span>
              <span>Action</span>
              <span>Target</span>
              <span>Metadata</span>
              <span className="text-right">Created</span>
            </AdminTableGrid>

            {loading ? (
              <TableMessage>Loading audit history...</TableMessage>
            ) : adminActions.length === 0 ? (
              <TableMessage>No admin actions recorded yet.</TableMessage>
            ) : (
              adminActions.map((action) => (
                <AdminTableGrid key={action.id} layout="audit">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{action.actor.name}</p>
                    <p className="mt-1 truncate text-xs text-ink/50">{action.actor.email}</p>
                  </div>
                  <span className="rounded-md bg-violet/10 px-2 py-1 text-xs font-semibold text-violet">
                    {labelize(action.action)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink/70">{labelize(action.targetType)}</p>
                    <p className="mt-1 truncate text-xs text-ink/45">{action.targetId ?? "No target id"}</p>
                  </div>
                  <p className="truncate text-ink/55">{summarizeMetadata(action.metadata)}</p>
                  <span className="text-right text-ink/55">{formatDate(action.createdAt)}</span>
                </AdminTableGrid>
              ))
            )}
        </AdminTable>
      </PageSection>

      <PageSection>
        <PanelHeader>
          <PanelIntro icon={FileText} iconClass="bg-ember/10 text-ember" title="Report history">
            Recent analytics and marketplace trade-history CSV/PDF exports, with generated file metadata.
          </PanelIntro>
          <PanelTag>
            {adminReports.length} recent
          </PanelTag>
        </PanelHeader>

        <AdminTable layout="reports">
            <AdminTableGrid header layout="reports">
              <span>Report</span>
              <span>Format</span>
              <span>Size</span>
              <span>Generated by</span>
              <span>Created</span>
              <span className="text-right">Action</span>
            </AdminTableGrid>

            {loading ? (
              <TableMessage>Loading report history...</TableMessage>
            ) : adminReports.length === 0 ? (
              <TableMessage>No reports exported yet.</TableMessage>
            ) : (
              adminReports.map((report) => (
                <ReportTableRow
                  downloadId={downloadId}
                  key={report.id}
                  onDownload={downloadReport}
                  report={report}
                />
              ))
            )}
        </AdminTable>
      </PageSection>

      <PageSection>
        <PanelTop>
          <PanelIntro icon={BarChart3} iconClass="bg-mint/12 text-mint" title="Admin analytics">
            Review platform health signals and download the current analytics evidence as CSV or PDF.
          </PanelIntro>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={analyticsExport !== null || loading}
              onClick={() => void exportAnalytics("csv")}
              type="button"
            >
              <Download size={17} />
              {analyticsExport === "csv" ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              disabled={analyticsExport !== null || loading}
              onClick={() => void exportAnalytics("pdf")}
              type="button"
              variant="secondary"
            >
              <Download size={17} />
              {analyticsExport === "pdf" ? "Exporting..." : "Export PDF"}
            </Button>
            <PanelTag>Last 30 days</PanelTag>
          </div>
        </PanelTop>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <AnalyticsTile icon={UsersRound} iconClass="text-mint" label="Active users" metric={analytics.activeUsersLast7Days} />
          <AnalyticsTile icon={Sparkles} iconClass="text-violet" label="XP generated" metric={analytics.xpGeneratedLast30Days} />
          <AnalyticsTile icon={Coins} iconClass="text-ember" label="Coin net" metric={analytics.coinInflationLast30Days.net} />
          <AnalyticsTile icon={ShieldAlert} iconClass="text-ember" label="Action taken" metric={analytics.abuseReports.actionTaken} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <DetailPanel minWidth>
            <PanelTitle>Coin inflation</PanelTitle>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <SummaryTile label="Earned" labelClass="text-mint" metric={analytics.coinInflationLast30Days.earned} panelClass="bg-mint/10" />
              <SummaryTile label="Spent" labelClass="text-ember" metric={analytics.coinInflationLast30Days.spent} panelClass="bg-ember/10" />
              <SummaryTile label="Net" labelClass="text-ink/55" metric={analytics.coinInflationLast30Days.net} panelClass="bg-paper" />
            </div>
          </DetailPanel>

          <DetailPanel>
            <PanelTitle>Abuse report status</PanelTitle>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <SummaryTile label="Open" labelClass="text-ember" metric={analytics.abuseReports.open} panelClass="bg-ember/10" />
              <SummaryTile label="Reviewed" labelClass="text-mint" metric={analytics.abuseReports.reviewed} panelClass="bg-mint/10" />
              <SummaryTile label="Action" labelClass="text-violet" metric={analytics.abuseReports.actionTaken} panelClass="bg-violet/12" />
              <SummaryTile label="Dismissed" labelClass="text-ink/55" metric={analytics.abuseReports.dismissed} panelClass="bg-paper" />
            </div>
          </DetailPanel>
        </div>

        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
          <RewardSourcesPanel sources={analytics.rewardSourcesLast30Days} />

          <DetailPanel>
            <div className="flex items-center gap-3">
              <Coins className="text-ember" size={20} />
              <PanelTitle>Coin flow by type</PanelTitle>
            </div>
            <div className="mt-4 space-y-2">
              {analytics.coinFlowByTypeLast30Days.length === 0 ? (
                <EmptyPanelMessage>No coin movement yet.</EmptyPanelMessage>
              ) : (
                analytics.coinFlowByTypeLast30Days.map((flow) => (
                  <div className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-2" key={flow.type}>
                    <span className="text-sm font-semibold">{labelize(flow.type)}</span>
                    <span className="rounded-md bg-white px-2 py-1 text-sm font-bold text-ink/70">{flow.amount}</span>
                  </div>
                ))
              )}
            </div>
          </DetailPanel>
        </div>

        <DetailPanel spaced>
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-mint" size={20} />
            <PanelTitle>Economy safeguards</PanelTitle>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {analytics.economySafeguards.length === 0 ? (
              <EmptyPanelMessage wide>No safeguard signals yet.</EmptyPanelMessage>
            ) : (
              analytics.economySafeguards.map((safeguard) => (
                <div className="rounded-md bg-paper p-3" key={safeguard.key}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold">{safeguard.label}</p>
                    <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", safeguardClass(safeguard.level))}>
                      {safeguard.level}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink/70">
                    {safeguard.currentValue} / {safeguard.threshold}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-ink/55">{safeguard.detail}</p>
                  <div className="mt-3 rounded-md bg-white px-3 py-2">
                    <MetricLabel>
                      {safeguard.enforcementAction.status === "RECOMMENDED" ? "Recommended action" : "Action"}
                    </MetricLabel>
                    <p className="mt-1 text-sm font-semibold text-ink/70">{safeguard.enforcementAction.label}</p>
                    <p className="mt-1 text-sm leading-5 text-ink/55">{safeguard.recommendation}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DetailPanel>

        <DetailPanel spaced>
          <div className="flex items-center gap-3">
            <Flag className="text-violet" size={20} />
            <PanelTitle>Most active guilds</PanelTitle>
          </div>
          <div className="mt-4 space-y-3">
            {analytics.mostActiveGuilds.length === 0 ? (
              <EmptyPanelMessage>No active guilds yet.</EmptyPanelMessage>
            ) : (
              analytics.mostActiveGuilds.map((guild) => (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper p-3" key={guild.id}>
                  <div>
                    <p className="font-semibold">{guild.name}</p>
                    <p className="mt-1 text-sm text-ink/50">{guild.memberCount} members</p>
                  </div>
                  <span className="rounded-md bg-violet/10 px-2 py-1 text-sm font-semibold text-violet">
                    {guild.totalXp} XP
                  </span>
                </div>
              ))
            )}
          </div>
        </DetailPanel>
      </PageSection>

      <PageSection>
        <PanelTop>
          <PanelIntro icon={SlidersHorizontal} iconClass="bg-violet/12 text-violet" title="Economy settings">
            Tune progression multipliers, coin limits, and quest reward caps.
          </PanelIntro>
          <PanelTag>
            Updated {economySettings.updatedAt ? formatDate(economySettings.updatedAt) : "not yet"}
          </PanelTag>
        </PanelTop>

        <form className="mt-5 grid gap-4 md:grid-cols-5" onSubmit={updateEconomySettings}>
          <Input
            disabled={savingEconomy || loading}
            label="XP multiplier"
            max={10}
            min={0.1}
            name="xpMultiplier"
            onChange={(event) => setEconomyForm((current) => ({ ...current, xpMultiplier: event.target.value }))}
            step={0.1}
            type="number"
            value={economyForm.xpMultiplier}
          />
          <Input
            disabled={savingEconomy || loading}
            label="Coin multiplier"
            max={10}
            min={0.1}
            name="coinMultiplier"
            onChange={(event) => setEconomyForm((current) => ({ ...current, coinMultiplier: event.target.value }))}
            step={0.1}
            type="number"
            value={economyForm.coinMultiplier}
          />
          <Input
            disabled={savingEconomy || loading}
            label="Daily coin limit"
            max={100000}
            min={0}
            name="dailyCoinLimit"
            onChange={(event) => setEconomyForm((current) => ({ ...current, dailyCoinLimit: event.target.value }))}
            step={1}
            type="number"
            value={economyForm.dailyCoinLimit}
          />
          <Input
            disabled={savingEconomy || loading}
            label="Max quest reward"
            max={100000}
            min={1}
            name="maxQuestReward"
            onChange={(event) => setEconomyForm((current) => ({ ...current, maxQuestReward: event.target.value }))}
            step={1}
            type="number"
            value={economyForm.maxQuestReward}
          />
          <Input
            disabled={savingEconomy || loading}
            label="Inflation rate"
            max={100}
            min={0}
            name="inflationRate"
            onChange={(event) => setEconomyForm((current) => ({ ...current, inflationRate: event.target.value }))}
            step={0.1}
            type="number"
            value={economyForm.inflationRate}
          />
          <div className="md:col-span-5">
            <Button disabled={savingEconomy || loading} type="submit">
              Save economy settings
            </Button>
          </div>
        </form>
      </PageSection>

      <PageSection>
        <PanelHeader>
          <div>
            <SectionHeading>Users</SectionHeading>
            <SupportingText spaced>Review accounts and update access status.</SupportingText>
          </div>
          <PanelTag>
            {adminCount} admins
          </PanelTag>
        </PanelHeader>

        <AdminTable layout="users">
          <AdminTableGrid header layout="users">
            <span>User</span>
            <span>Role</span>
            <span>Security</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </AdminTableGrid>

          {loading ? (
            <TableMessage>Loading users...</TableMessage>
          ) : users.length === 0 ? (
            <TableMessage>No users found.</TableMessage>
          ) : (
            users.map((account) => (
              <UserTableRow
                account={account}
                isSuperAdmin={isSuperAdmin}
                key={account.id}
                onRoleChange={changeUserRole}
                onSaveRole={updateUserRole}
                onSaveStatus={updateUserStatus}
                onStatusChange={changeUserStatus}
                pendingRole={roles[account.id] ?? account.role}
                pendingStatus={statuses[account.id] ?? account.status}
                savingRoleId={savingRoleId}
                savingUserId={savingUserId}
                viewerId={user.id}
              />
            ))
          )}
        </AdminTable>
      </PageSection>

      <PageSection>
        <PanelHeader>
          <PanelIntro icon={Store} iconClass="bg-violet/12 text-violet" title="Marketplace moderation">
            Review or remove cosmetic listings and export marketplace trade history as CSV or PDF.
          </PanelIntro>
          <PanelTag>
            {marketplaceListings.filter((listing) => listing.status === "ACTIVE").length} active
          </PanelTag>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={tradeExport !== null || loading}
              onClick={() => void exportTrades("csv")}
              type="button"
              variant="ghost"
            >
              <Download size={16} />
              {tradeExport === "csv" ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              disabled={tradeExport !== null || loading}
              onClick={() => void exportTrades("pdf")}
              type="button"
              variant="ghost"
            >
              <Download size={16} />
              {tradeExport === "pdf" ? "Exporting..." : "Export PDF"}
            </Button>
          </div>
        </PanelHeader>

        <AdminTable layout="marketplace">
            <AdminTableGrid header layout="marketplace">
              <span>Listing</span>
              <span>Seller</span>
              <span>Price</span>
              <span>Status</span>
              <span>Created</span>
              <span className="text-right">Action</span>
            </AdminTableGrid>

            {loading ? (
              <TableMessage>Loading marketplace listings...</TableMessage>
            ) : marketplaceListings.length === 0 ? (
              <TableMessage>No marketplace listings found.</TableMessage>
            ) : (
              marketplaceListings.map((listing) => (
                <AdminTableGrid key={listing.id} layout="marketplace">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{listing.cosmetic.name}</p>
                    <p className="mt-1 truncate text-xs text-ink/50">
                      {labelize(listing.cosmetic.rarity)} / {labelize(listing.cosmetic.slot)}
                    </p>
                  </div>
                  <span className="truncate text-ink/65">{listing.sellerName}</span>
                  <span className="font-semibold text-ink/70">{listing.priceCoins} coins</span>
                  <span className={clsx("w-fit rounded-md px-2 py-1 text-xs font-semibold", marketplaceStatusClass(listing.status))}>
                    {listing.status}
                  </span>
                  <span className="text-ink/55">{formatDate(listing.createdAt)}</span>
                  <div className="flex justify-end">
                    <Button
                      disabled={listing.status !== "ACTIVE" || savingListingId === listing.id}
                      onClick={() => void cancelListing(listing)}
                      type="button"
                      variant="ghost"
                    >
                      {savingListingId === listing.id ? "Cancelling..." : "Cancel"}
                    </Button>
                  </div>
                </AdminTableGrid>
              ))
            )}
        </AdminTable>
      </PageSection>

      <PageSection>
        <PanelHeader>
          <div>
            <SectionHeading>Abuse reports</SectionHeading>
            <SupportingText spaced>
              Review member submissions and transparent automatic rules for rapid or repetitive quest completions, then record moderation outcomes.
            </SupportingText>
          </div>
          <PanelTag>
            {criticalCount} critical open
          </PanelTag>
        </PanelHeader>

        <div className="mt-5 space-y-3">
          {loading ? (
            <EmptyPanelMessage>Loading abuse reports...</EmptyPanelMessage>
          ) : abuseReports.length === 0 ? (
            <EmptyPanelMessage>No abuse reports found.</EmptyPanelMessage>
          ) : (
            abuseReports.map((report) => (
              <AbuseReportCard
                key={report.id}
                onSave={updateAbuseReport}
                onStatusChange={changeReportStatus}
                pendingStatus={reportStatuses[report.id] ?? report.status}
                report={report}
                savingReportId={savingReportId}
              />
            ))
          )}
        </div>
      </PageSection>
    </AppShell>
  );
}
