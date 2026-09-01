"use client";

import { Download, LogOut, MonitorSmartphone, RotateCw, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { SectionHeading } from "@/components/ui/PagePrimitives";
import { apiDownload, apiRequest, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { AuthUser } from "@/types/auth";
import type { UserSession } from "@/types/session";

function revokeSavedSession(current: UserSession[], session: UserSession) {
  return current.map((savedSession) => (
    savedSession.id === session.id ? { ...savedSession, revokedAt: new Date().toISOString() } : savedSession
  ));
}

export function AccountControlPanel({ enabled, role }: { enabled: boolean; role: AuthUser["role"] }) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!enabled || role !== "USER") {
      return;
    }

    setLoading(true);

    try {
      const sessionList = await apiRequest<{ sessions: UserSession[] }>("/auth/sessions");
      setSessions(sessionList.sessions);
    } catch (err) {
      setError(errorMessage(err, "Could not load account sessions."));
    } finally {
      setLoading(false);
    }
  }, [enabled, role]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function exportAccount() {
    setExporting(true);
    setError(null);
    setNotice(null);

    try {
      const file = await apiDownload("/account/export");
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Account export downloaded.");
    } catch (err) {
      setError(errorMessage(err, "Could not export account data."));
    } finally {
      setExporting(false);
    }
  }

  async function revokeSession(session: UserSession) {
    setSavingId(session.id);
    setError(null);
    setNotice(null);

    try {
      await apiRequest(`/auth/sessions/${session.id}`, { method: "DELETE" });

      if (session.current) {
        logout();
        router.push("/login");
        return;
      }

      setSessions((current) => revokeSavedSession(current, session));
      setNotice("Session revoked.");
    } catch (err) {
      setError(errorMessage(err, "Could not revoke the session."));
    } finally {
      setSavingId(null);
    }
  }

  async function revokeAllSessions() {
    setSavingId("all");
    setError(null);

    try {
      await apiRequest("/auth/sessions/revoke-all", { method: "POST" });
      logout();
      router.push("/login");
    } catch (err) {
      setError(errorMessage(err, "Could not sign out all sessions."));
      setSavingId(null);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    setNotice(null);

    try {
      await apiRequest("/account", {
        method: "DELETE",
        body: JSON.stringify({
          currentPassword: deletePassword,
          confirmation: deleteText
        })
      });
      logout();
      router.push("/login");
    } catch (err) {
      setError(errorMessage(err, "Could not delete the account."));
      setDeleting(false);
    }
  }

  const activeSessions = sessions.filter((session) => !session.revokedAt);

  return (
    <section className="mt-6 border-y border-line bg-white py-6 shadow-panel">
      <div className="px-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sky/10 text-sky">
              <MonitorSmartphone size={20} />
            </span>
            <div>
              <SectionHeading>Account controls</SectionHeading>
              <p className="mt-1 text-sm leading-6 text-ink/55">
                Review active sign-ins and keep a portable copy of your LevelUpX data.
              </p>
            </div>
          </div>
          <Button disabled={exporting} onClick={() => void exportAccount()} type="button" variant="secondary">
            <Download size={17} />
            {exporting ? "Preparing..." : "Export my data"}
          </Button>
        </div>

        {error && <Notice space="panel" tone="error">{error}</Notice>}
        {notice && <Notice space="panel" tone="success">{notice}</Notice>}

        {role === "USER" ? (
          <>
            <div className="mt-6 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">Signed-in devices</h3>
                <p className="mt-1 text-sm text-ink/50">{activeSessions.length} active session{activeSessions.length === 1 ? "" : "s"}</p>
              </div>
              <button
                aria-label="Refresh signed-in devices"
                className="lx-button flex h-10 w-10 items-center justify-center rounded-md border border-line text-violet hover:bg-paper"
                disabled={loading}
                onClick={() => void loadSessions()}
                title="Refresh sessions"
                type="button"
              >
                <RotateCw size={16} />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-md border border-line">
              {activeSessions.map((session) => (
                <SignedInDevice
                  key={session.id}
                  onRevoke={revokeSession}
                  saving={savingId === session.id}
                  session={session}
                />
              ))}
              {!loading && activeSessions.length === 0 && (
                <p className="p-4 text-sm text-ink/50">No refresh sessions are active for this account.</p>
              )}
              {loading && <p className="p-4 text-sm text-ink/50">Checking signed-in devices...</p>}
            </div>

            <Button
              className="mt-4"
              disabled={savingId === "all" || activeSessions.length === 0}
              onClick={() => void revokeAllSessions()}
              type="button"
              variant="ghost"
            >
              <LogOut size={16} />
              Sign out everywhere
            </Button>

            <div className="mt-8 border-t border-ember/20 pt-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ember/10 text-ember">
                  <ShieldAlert size={19} />
                </span>
                <div>
                  <h3 className="font-bold text-ember">Delete account</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/55">
                    This permanently removes your profile and owned data. Enter your password and type DELETE to continue.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input
                  label="Current password"
                  name="deleteAccountPassword"
                  onChange={(event) => setDeletePassword(event.target.value)}
                  type="password"
                  value={deletePassword}
                />
                <Input
                  label="Confirmation"
                  name="deleteAccountConfirmation"
                  onChange={(event) => setDeleteText(event.target.value)}
                  placeholder="DELETE"
                  value={deleteText}
                />
              </div>
              <Button
                className="mt-3 border-ember bg-ember hover:bg-ember/90"
                disabled={deleting || deletePassword.length < 8 || deleteText !== "DELETE"}
                onClick={() => void deleteAccount()}
                type="button"
              >
                <Trash2 size={17} />
                {deleting ? "Deleting..." : "Permanently delete account"}
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-md border border-violet/20 bg-violet/5 p-4">
            <p className="font-bold text-violet">Privileged account lifecycle</p>
            <p className="mt-1 text-sm leading-6 text-ink/55">
              Admin and super-admin removal remains backend-only so an active browser session cannot weaken platform ownership controls.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function SignedInDevice({
  onRevoke,
  saving,
  session
}: {
  onRevoke: (session: UserSession) => Promise<void>;
  saving: boolean;
  session: UserSession;
}) {
  return (
    <article className="grid gap-3 border-b border-line p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-bold">{browserLabel(session.userAgent)}</h4>
          {session.current && (
            <span className="rounded-md bg-mint/10 px-2 py-0.5 text-[10px] font-bold text-mint">This device</span>
          )}
        </div>
        <p className="mt-1 text-xs text-ink/45">
          {session.ipAddress || "IP unavailable"} · Last used {formatSessionDate(session.lastUsedAt)}
        </p>
      </div>
      <Button disabled={saving} onClick={() => void onRevoke(session)} type="button" variant="ghost">
        <LogOut size={16} />
        {session.current ? "Sign out" : "Revoke"}
      </Button>
    </article>
  );
}

function browserLabel(userAgent: string | null) {
  if (!userAgent) {
    return "Unknown browser";
  }

  if (userAgent.includes("Edg/")) return "Microsoft Edge";
  if (userAgent.includes("Firefox/")) return "Mozilla Firefox";
  if (userAgent.includes("Chrome/")) return "Google Chrome";
  if (userAgent.includes("Safari/")) return "Apple Safari";
  return userAgent.slice(0, 70);
}

function formatSessionDate(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}
