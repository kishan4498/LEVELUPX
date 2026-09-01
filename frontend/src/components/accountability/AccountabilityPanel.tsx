"use client";

import { clsx } from "clsx";
import { Ban, Check, Clock3, Flame, ListChecks, Radio, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { SectionHeading } from "@/components/ui/PagePrimitives";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { apiRequest, errorMessage } from "@/lib/api";
import { trackProductEvent } from "@/lib/productEvents";
import type { FocusPresencePayload } from "@/lib/realtime";
import type { AccountabilityConnection } from "@/types/accountability";

function replaceConnection(current: AccountabilityConnection[], saved: AccountabilityConnection) {
  return current.map((connection) => (connection.id === saved.id ? saved : connection));
}

function withoutConnection(current: AccountabilityConnection[], id: string) {
  return current.filter((connection) => connection.id !== id);
}

function withoutPresence(
  current: Record<string, FocusPresencePayload>,
  userId: string
) {
  return Object.fromEntries(
    Object.entries(current).filter(([candidateUserId]) => candidateUserId !== userId)
  );
}

export function AccountabilityPanel({ accessToken, enabled }: { accessToken: string | null; enabled: boolean }) {
  const [connections, setConnections] = useState<AccountabilityConnection[]>([]);
  const [email, setEmail] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [presenceByUser, setPresenceByUser] = useState<Record<string, FocusPresencePayload>>({});

  const realtimeHandlers = useMemo(
    () => ({
      "focus.presence.changed": (presence: FocusPresencePayload) => {
        setPresenceByUser((current) => ({ ...current, [presence.userId]: presence }));
      }
    }),
    []
  );

  useRealtimeSocket({ accessToken, enabled, handlers: realtimeHandlers });

  const loadConnections = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const connectionList = await apiRequest<{ connections: AccountabilityConnection[] }>("/accountability");
      setConnections(connectionList.connections);
    } catch (err) {
      setError(errorMessage(err, "Could not load accountability connections."));
    }
  }, [enabled]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const created = await apiRequest<{ connection: AccountabilityConnection }>("/accountability", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() })
      });
      setConnections((current) => [created.connection, ...current]);
      setEmail("");
      setNotice("Accountability request sent.");
    } catch (err) {
      setError(errorMessage(err, "Could not send the request."));
    } finally {
      setSending(false);
    }
  }

  async function respond(connection: AccountabilityConnection, status: "ACCEPTED" | "DECLINED") {
    setSavingId(connection.id);
    setError(null);
    setNotice(null);

    try {
      const updated = await apiRequest<{ connection: AccountabilityConnection }>(
        `/accountability/${connection.id}/respond`,
        {
          method: "PATCH",
          body: JSON.stringify({ status })
        }
      );
      setConnections((current) => replaceConnection(current, updated.connection));
      setNotice(status === "ACCEPTED" ? "Accountability connection accepted." : "Request declined.");

      if (status === "ACCEPTED") {
        await loadConnections();
        void trackProductEvent("accountability_connected", { direction: connection.direction });
      }
    } catch (err) {
      setError(errorMessage(err, "Could not update the request."));
    } finally {
      setSavingId(null);
    }
  }

  async function block(connection: AccountabilityConnection) {
    setSavingId(connection.id);
    setError(null);

    try {
      const updated = await apiRequest<{ connection: AccountabilityConnection }>(
        `/accountability/${connection.id}/block`,
        { method: "POST" }
      );
      setConnections((current) => replaceConnection(current, updated.connection));
      setPresenceByUser((current) => withoutPresence(current, connection.person.id));
      setNotice("Connection blocked.");
    } catch (err) {
      setError(errorMessage(err, "Could not block the connection."));
    } finally {
      setSavingId(null);
    }
  }

  async function remove(connection: AccountabilityConnection) {
    setSavingId(connection.id);
    setError(null);

    try {
      await apiRequest(`/accountability/${connection.id}`, { method: "DELETE" });
      setConnections((current) => withoutConnection(current, connection.id));
      setPresenceByUser((current) => withoutPresence(current, connection.person.id));
      setNotice("Connection removed.");
    } catch (err) {
      setError(errorMessage(err, "Could not remove the connection."));
    } finally {
      setSavingId(null);
    }
  }

  const visibleConnections = connections.filter((connection) => connection.status !== "DECLINED");

  return (
    <section className="mt-6 border-y border-line bg-white py-6 shadow-panel">
      <div className="px-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-violet/10 text-violet">
              <UsersRound size={20} />
            </span>
            <div>
              <SectionHeading>Accountability circle</SectionHeading>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/55">
                Accepted connections see your seven-day totals and live focus state, never private task details.
              </p>
            </div>
          </div>
          <form className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl" onSubmit={sendRequest}>
            <Input
              className="w-full sm:min-w-[280px]"
              label="Invite by email"
              name="accountabilityEmail"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@example.com"
              required
              type="email"
              value={email}
            />
            <Button className="sm:mt-7" disabled={sending || !email.trim()} type="submit" variant="secondary">
              <UserPlus size={17} />
              {sending ? "Sending..." : "Invite"}
            </Button>
          </form>
        </div>

        {error && <Notice space="panel" tone="error">{error}</Notice>}
        {notice && <Notice space="panel" tone="success">{notice}</Notice>}

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {visibleConnections.map((connection) => (
            <ConnectionCard
              connection={connection}
              key={connection.id}
              onBlock={block}
              onRemove={remove}
              onRespond={respond}
              presence={presenceByUser[connection.person.id] ?? connection.progress?.focusPresence ?? null}
              saving={savingId === connection.id}
            />
          ))}

          {visibleConnections.length === 0 && (
            <div className="rounded-md border border-dashed border-line p-6 text-center lg:col-span-2">
              <UserPlus className="mx-auto text-violet" size={21} />
              <p className="mt-3 font-bold">Build a small support loop</p>
              <p className="mt-1 text-sm text-ink/50">Invite one trusted person and keep progress visible without sharing private tasks.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ConnectionCard({
  connection,
  onBlock,
  onRemove,
  onRespond,
  presence,
  saving
}: {
  connection: AccountabilityConnection;
  onBlock: (connection: AccountabilityConnection) => Promise<void>;
  onRemove: (connection: AccountabilityConnection) => Promise<void>;
  onRespond: (connection: AccountabilityConnection, status: "ACCEPTED" | "DECLINED") => Promise<void>;
  presence: FocusPresencePayload | NonNullable<NonNullable<AccountabilityConnection["progress"]>["focusPresence"]> | null;
  saving: boolean;
}) {
  return (
    <article className="rounded-md border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{connection.person.name}</h3>
          <p className="mt-1 text-xs font-semibold text-ink/45">
            {connection.direction === "INCOMING" ? "Invited you" : "Invited by you"} · {formatStatus(connection.status)}
          </p>
        </div>
        <span className={clsx("rounded-md px-2 py-1 text-xs font-bold", statusTone(connection.status))}>
          {formatStatus(connection.status)}
        </span>
      </div>

      {connection.status === "ACCEPTED" && presence && presence.state !== "IDLE" && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-violet/8 px-3 py-2 text-sm font-semibold text-violet">
          <Radio className={presence.state === "FOCUSING" ? "animate-pulse" : ""} size={15} />
          {presence.state === "PAUSED" ? "Focus paused" : "Focusing now"}
          {presence.targetMinutes ? ` · ${presence.targetMinutes} min target` : ""}
        </div>
      )}

      {connection.progress && (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <ProgressMetric icon={ListChecks} label="Quests" metric={connection.progress.completedQuestsLast7Days} />
          <ProgressMetric icon={Clock3} label="Focus" metric={`${connection.progress.focusMinutesLast7Days}m`} />
          <ProgressMetric icon={Flame} label="Streak" metric={`${connection.progress.currentStreak}d`} />
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        {connection.direction === "INCOMING" && connection.status === "PENDING" && (
          <>
            <Button disabled={saving} onClick={() => void onRespond(connection, "ACCEPTED")} type="button" variant="secondary">
              <Check size={16} />
              Accept
            </Button>
            <Button disabled={saving} onClick={() => void onRespond(connection, "DECLINED")} type="button" variant="ghost">
              <X size={16} />
              Decline
            </Button>
          </>
        )}
        {connection.status !== "BLOCKED" && (
          <button
            aria-label={`Block ${connection.person.name}`}
            className="lx-button flex h-11 w-11 items-center justify-center rounded-md border border-line text-ember hover:bg-ember/10 disabled:opacity-55"
            disabled={saving}
            onClick={() => void onBlock(connection)}
            title="Block connection"
            type="button"
          >
            <Ban size={16} />
          </button>
        )}
        <button
          aria-label={`Remove ${connection.person.name}`}
          className="lx-button flex h-11 w-11 items-center justify-center rounded-md border border-line text-ink/55 hover:bg-paper disabled:opacity-55"
          disabled={saving}
          onClick={() => void onRemove(connection)}
          title="Remove connection"
          type="button"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function ProgressMetric({
  icon: Icon,
  label,
  metric
}: {
  icon: typeof ListChecks;
  label: string;
  metric: string | number;
}) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <Icon className="text-violet" size={15} />
      <dt className="mt-2 text-[10px] font-bold text-ink/40">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold">{metric}</dd>
    </div>
  );
}

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function statusTone(status: AccountabilityConnection["status"]) {
  if (status === "ACCEPTED") return "bg-mint/10 text-mint";
  if (status === "BLOCKED") return "bg-ember/10 text-ember";
  return "bg-gold/10 text-gold";
}
