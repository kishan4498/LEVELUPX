"use client";

import { clsx } from "clsx";
import { FileWarning, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AbuseEvidence } from "@/components/abuse/AbuseEvidence";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { EmptyPanelMessage, PagePanel, PanelHeader, PanelTag, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { StatCard } from "@/components/ui/StatCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import type { AbuseReport, AbuseReportStatus, AbuseSeverity } from "@/types/abuseReport";

const severityOptions: AbuseSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(timestamp));
}

function severityClass(severity: AbuseSeverity) {
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

function statusClass(status: AbuseReportStatus) {
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

export default function AbuseReportsPage() {
  const { accessToken } = useRequireAuth();
  const [reports, setReports] = useState<AbuseReport[]>([]);
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<AbuseSeverity>("LOW");
  const [reportContext, setReportContext] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openCount = reports.filter((report) => report.status === "OPEN").length;
  const resolvedCount = reports.length - openCount;

  const loadReports = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const reportList = await apiRequest<{ reports: AbuseReport[] }>("/abuse-reports/me");
      setReports(reportList.reports);
    } catch (err) {
      setError(errorMessage(err, "Could not load abuse reports"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await apiRequest<{ report: AbuseReport }>("/abuse-reports", {
        method: "POST",
        body: JSON.stringify({
          reason,
          severity,
          metadata: reportContext.trim()
            ? {
                context: reportContext.trim()
              }
            : undefined
        })
      });

      setReason("");
      setSeverity("LOW");
      setReportContext("");
      setNotice("Report submitted for review.");
      await loadReports();
    } catch (err) {
      setError(errorMessage(err, "Could not submit report"));
    } finally {
      setSaving(false);
    }
  }

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Reports" title="Abuse reports">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={FileWarning} iconClass="text-violet" label="Submitted" metric={reports.length} />
        <StatCard icon={ShieldAlert} iconClass="text-ember" label="Open" metric={openCount} />
        <StatCard icon={ShieldCheck} iconClass="text-mint" label="Reviewed or closed" metric={resolvedCount} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form className="rounded-lg bg-white p-6 shadow-panel" onSubmit={createReport}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ember/12 text-ember">
              <Plus size={20} />
            </div>
            <div>
              <SectionHeading>Submit report</SectionHeading>
              <SupportingText>Reports are reviewed by admins.</SupportingText>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-ink" htmlFor="reason">
              <span>Reason</span>
              <textarea
                className="min-h-32 rounded-md border border-ink/15 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-ink/35 focus:border-mint focus:ring-2 focus:ring-mint/20"
                disabled={saving}
                id="reason"
                maxLength={500}
                minLength={10}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Describe the suspicious or harmful behavior."
                value={reason}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink" htmlFor="severity">
              <span>Severity</span>
              <select
                className="h-11 rounded-md border border-ink/15 bg-white px-3 text-sm outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
                disabled={saving}
                id="severity"
                onChange={(event) => setSeverity(event.target.value as AbuseSeverity)}
                value={severity}
              >
                {severityOptions.map((severityOption) => (
                  <option key={severityOption} value={severityOption}>
                    {severityOption}
                  </option>
                ))}
              </select>
            </label>
            <Input
              disabled={saving}
              label="Optional context"
              name="context"
              onChange={(event) => setReportContext(event.target.value)}
              placeholder="Quest title, guild name, or related detail"
              value={reportContext}
            />
            <Button disabled={saving || reason.trim().length < 10} type="submit">
              <Plus size={18} />
              Submit report
            </Button>
          </div>
        </form>

        <PagePanel>
          <PanelHeader>
            <div>
              <SectionHeading>My reports</SectionHeading>
              <SupportingText spaced>Only admins can change report status.</SupportingText>
            </div>
            <PanelTag>
              {openCount} open
            </PanelTag>
          </PanelHeader>

          <div className="mt-5 space-y-3">
            {loading ? (
              <EmptyPanelMessage>Loading reports...</EmptyPanelMessage>
            ) : reports.length === 0 ? (
              <EmptyPanelMessage>No reports submitted yet.</EmptyPanelMessage>
            ) : (
              reports.map((report) => (
                <article className="rounded-lg border border-ink/8 p-4" key={report.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", severityClass(report.severity))}>
                      {report.severity}
                    </span>
                    <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", statusClass(report.status))}>
                      {report.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink/65">{report.reason}</p>
                  <AbuseEvidence metadata={report.metadata} />
                  <p className="mt-3 text-sm text-ink/45">Submitted {formatDate(report.createdAt)}</p>
                </article>
              ))
            )}
          </div>
        </PagePanel>
      </section>
    </AppShell>
  );
}
