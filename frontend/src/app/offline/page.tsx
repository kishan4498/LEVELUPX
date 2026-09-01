"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { ArrowLeft, CloudUpload, ListChecks, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api";
import {
  flushOfflineActions,
  listOfflineActions,
  offlineQueueChangedEvent,
  removeOfflineAction,
  retryOfflineAction,
  type OfflineAction
} from "@/lib/offlineQueue";

export default function OfflinePage() {
  const [actions, setActions] = useState<OfflineAction[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listOfflineActions()
      .then(setActions)
      .catch((err) => setError(errorMessage(err, "Could not read offline actions.")));
  }, []);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);

    updateConnection();
    refresh();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener(offlineQueueChangedEvent, refresh);

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener(offlineQueueChangedEvent, refresh);
    };
  }, [refresh]);

  async function sync(run: () => Promise<OfflineAction[]>, fallback: string) {
    setSyncing(true);
    setError(null);

    try {
      setActions(await run());
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setSyncing(false);
    }
  }

  const syncAll = () => sync(flushOfflineActions, "Could not sync offline actions.");
  const retry = (id: string) =>
    sync(() => retryOfflineAction(id), "Could not retry this action.");

  async function remove(id: string) {
    await removeOfflineAction(id);
    refresh();
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-violet" href="/dashboard">
          <ArrowLeft size={16} />
          Back to today
        </Link>

        <header className="mt-6 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span
              className={clsx(
                "inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-bold",
                online ? "bg-mint/10 text-mint" : "bg-ember/10 text-ember"
              )}
            >
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
              {online ? "Connection available" : "Working offline"}
            </span>
            <h1 className="mt-3 text-2xl font-bold">Offline action queue</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink/55">
              Captured quests stay on this device until an authenticated connection sends them successfully.
            </p>
          </div>
          <button
            className="lx-button inline-flex h-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-4 text-sm font-bold text-white disabled:opacity-55"
            disabled={!online || syncing || actions.length === 0}
            onClick={() => void syncAll()}
            type="button"
          >
            <CloudUpload size={17} />
            {syncing ? "Syncing..." : "Sync all"}
          </button>
        </header>

        {error && (
          <p className="mt-5 rounded-md border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>
        )}

        <section className="mt-6 overflow-hidden rounded-md border border-line bg-white shadow-panel">
          {actions.map((action) => (
            <article
              className="grid gap-4 border-b border-line p-4 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center"
              key={action.id}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-violet/10 text-violet">
                <ListChecks size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-bold">
                    {String(action.body.title ?? "Untitled quest")}
                  </h2>
                  <span
                    className={clsx(
                      "rounded-md px-2 py-0.5 text-[10px] font-bold",
                      action.status === "FAILED" ? "bg-ember/10 text-ember" : "bg-gold/10 text-gold"
                    )}
                  >
                    {action.status === "FAILED" ? "Needs attention" : "Waiting to sync"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink/45">
                  Saved {formatDate(action.createdAt)}
                  {action.attempts > 0 ? ` · ${action.attempts} sync attempt${action.attempts === 1 ? "" : "s"}` : ""}
                </p>
                {action.lastError && <p className="mt-1 text-xs text-ember">{action.lastError}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Retry this offline action"
                  className="lx-button flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white text-violet hover:bg-paper disabled:opacity-55"
                  disabled={!online || syncing}
                  onClick={() => void retry(action.id)}
                  title="Retry"
                  type="button"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  aria-label="Discard this offline action"
                  className="lx-button flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white text-ember hover:bg-ember/10"
                  onClick={() => void remove(action.id)}
                  title="Discard"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}

          {actions.length === 0 && (
            <div className="flex min-h-[220px] flex-col items-center justify-center p-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-mint/10 text-mint">
                <CloudUpload size={20} />
              </span>
              <h2 className="mt-4 font-bold">Everything is synced</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink/50">
                New quick-capture quests will appear here only when the API cannot be reached.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}
