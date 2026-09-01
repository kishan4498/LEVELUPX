"use client";

import clsx from "clsx";
import {
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Inbox,
  Medal,
  RotateCw,
  Satellite,
  Settings2,
  Sparkles,
  Trophy,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { type ChangeEventHandler, type ReactNode, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { EmptyPanelMessage, MetaLabel, PageSection, PanelHeader, PanelTag, RouteFallback, SectionHeading, SupportingText } from "@/components/ui/PagePrimitives";
import { StatCard } from "@/components/ui/StatCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import type { AppNotification, NotificationPreferences, PushSubscriptionStatus } from "@/types/notification";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const emptyPreferences: NotificationPreferences = {
  inAppEnabled: true,
  rewardNotifications: true,
  achievementNotifications: true,
  insightNotifications: true,
  guildNotifications: true,
  pushNotifications: false,
  questReminders: true,
  dailyDigest: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  updatedAt: ""
};

type TogglePreferenceKey =
  | "inAppEnabled"
  | "rewardNotifications"
  | "achievementNotifications"
  | "insightNotifications"
  | "guildNotifications"
  | "pushNotifications"
  | "questReminders"
  | "dailyDigest";

type PushReadiness = {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  serviceWorkerReady: boolean;
  subscribed: boolean;
  stored: boolean;
};

const preferenceOptions: {
  key: TogglePreferenceKey;
  label: string;
  detail: string;
}[] = [
  {
    key: "inAppEnabled",
    label: "In-app inbox",
    detail: "Keep notifications visible inside LevelUpX."
  },
  {
    key: "rewardNotifications",
    label: "Reward updates",
    detail: "Quest XP and coin reward messages."
  },
  {
    key: "achievementNotifications",
    label: "Achievements",
    detail: "Achievement unlock messages."
  },
  {
    key: "insightNotifications",
    label: "AI insights",
    detail: "Generated insight and recommendation messages."
  },
  {
    key: "guildNotifications",
    label: "Guild and team",
    detail: "Guild activity and team quest messages."
  },
  {
    key: "pushNotifications",
    label: "Browser push",
    detail: "Prepare browser push delivery once provider keys are configured."
  },
  {
    key: "questReminders",
    label: "Quest reminders",
    detail: "Warn when a scheduled quest is ready to begin."
  },
  {
    key: "dailyDigest",
    label: "Daily briefing",
    detail: "Receive one compact summary of today's active work."
  }
];

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatCategory(category: AppNotification["category"]) {
  return category.toLowerCase().replaceAll("_", " ");
}

const categoryVisuals: Record<
  AppNotification["category"],
  {
    Icon: LucideIcon;
    activeClass: string;
    mutedClass: string;
    chipClass: string;
  }
> = {
  GENERAL: {
    Icon: Bell,
    activeClass: "bg-ink text-white",
    mutedClass: "bg-ink/8 text-ink/45",
    chipClass: "bg-ink/8 text-ink/55"
  },
  REWARD: {
    Icon: Sparkles,
    activeClass: "bg-ember text-white",
    mutedClass: "bg-ember/10 text-ember",
    chipClass: "bg-ember/10 text-ember"
  },
  ACHIEVEMENT: {
    Icon: Trophy,
    activeClass: "bg-violet text-white",
    mutedClass: "bg-violet/10 text-violet",
    chipClass: "bg-violet/10 text-violet"
  },
  INSIGHT: {
    Icon: Circle,
    activeClass: "bg-mint text-white",
    mutedClass: "bg-mint/10 text-mint",
    chipClass: "bg-mint/10 text-mint"
  },
  GUILD: {
    Icon: Medal,
    activeClass: "bg-ink text-white",
    mutedClass: "bg-ink/8 text-ink/45",
    chipClass: "bg-ink/8 text-ink/55"
  },
  QUEST_REMINDER: {
    Icon: Clock3,
    activeClass: "bg-sky text-white",
    mutedClass: "bg-sky/10 text-sky",
    chipClass: "bg-sky/10 text-sky"
  },
  DAILY_DIGEST: {
    Icon: CalendarClock,
    activeClass: "bg-gold text-white",
    mutedClass: "bg-gold/10 text-gold",
    chipClass: "bg-gold/10 text-gold"
  }
};

function decodeVapidKey(vapidKey: string) {
  // Browser Push expects bytes, but VAPID keys ship as URL-safe base64.
  const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
  const base64 = `${vapidKey}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function emitUnread(count: number) {
  window.dispatchEvent(
    new CustomEvent("levelupx:notifications-changed", {
      detail: { unreadCount: count }
    })
  );
}

function workerReadyUpdate(subscription: PushSubscription | null) {
  return (current: PushReadiness): PushReadiness => ({
    ...current,
    serviceWorkerReady: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription)
  });
}

function markWorkerUnavailable(current: PushReadiness): PushReadiness {
  return { ...current, serviceWorkerReady: false };
}

function replaceNotification(current: AppNotification[], id: string, saved: AppNotification) {
  return current.map((notification) => (notification.id === id ? saved : notification));
}

function addSubscription(current: PushSubscriptionStatus[], saved: PushSubscriptionStatus) {
  return [saved, ...current.filter((subscription) => subscription.id !== saved.id)];
}

function disableSubscription(current: PushSubscriptionStatus[], endpoint: string) {
  return current.map((subscription) =>
    subscription.endpoint === endpoint
      ? {
          ...subscription,
          disabledAt: new Date().toISOString()
        }
      : subscription
  );
}

function Readout({ label, metric }: { label: string; metric: ReactNode }) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <MetaLabel>{label}</MetaLabel>
      <p className="mt-1 text-sm font-semibold">{metric}</p>
    </div>
  );
}

function InboxMessage({ children }: { children: ReactNode }) {
  return <EmptyPanelMessage>{children}</EmptyPanelMessage>;
}

function NotificationHeading({
  description,
  icon: Icon,
  iconClass,
  iconSize = 20,
  section = false,
  title
}: {
  description: ReactNode;
  icon: LucideIcon;
  iconClass: string;
  iconSize?: number;
  section?: boolean;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={clsx("flex h-10 w-10 items-center justify-center rounded-md", iconClass)}>
        <Icon size={iconSize} />
      </div>
      <div>
        {section ? <SectionHeading>{title}</SectionHeading> : <h3 className="font-bold">{title}</h3>}
        <SupportingText>{description}</SupportingText>
      </div>
    </div>
  );
}

function QuietHourField({
  id,
  label,
  onChange,
  value: time
}: {
  id: string;
  label: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold" htmlFor={id}>
      {label}
      <input
        className="lx-field h-11 rounded-md border border-line bg-white px-3 outline-none focus:border-sky focus:ring-2 focus:ring-sky/15"
        id={id}
        onChange={onChange}
        type="time"
        value={time}
      />
    </label>
  );
}

function AchievementLink({ label }: { label: string }) {
  return (
    <Link
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-mint px-4 text-sm font-semibold text-white transition hover:bg-mint/90 focus:outline-none focus:ring-2 focus:ring-ink/20"
      href="/achievements"
    >
      <Trophy size={17} />
      {label}
    </Link>
  );
}

function NotificationTag({
  capitalize = false,
  children,
  tone
}: {
  capitalize?: boolean;
  children: ReactNode;
  tone: string;
}) {
  return (
    <span
      className={clsx(
        capitalize
          ? "rounded-md px-2 py-1 text-xs font-semibold capitalize"
          : "rounded-md px-2 py-1 text-xs font-semibold",
        tone
      )}
    >
      {children}
    </span>
  );
}

export default function NotificationsPage() {
  const { accessToken } = useRequireAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionStatus[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(emptyPreferences);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingPref, setSavingPref] = useState<TogglePreferenceKey | null>(null);
  const [savingHours, setSavingHours] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushReadiness>({
    supported: false,
    configured: Boolean(vapidPublicKey),
    permission: "default" as NotificationPermission | "unsupported",
    serviceWorkerReady: false,
    subscribed: false,
    stored: false
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const readCount = notifications.length - unreadCount;
  const achievementItems = notifications.filter((notification) => notification.category === "ACHIEVEMENT");
  const unreadAchievements = achievementItems.filter((notification) => !notification.readAt).length;
  const activeSubs = subscriptions.filter((subscription) => !subscription.disabledAt);
  const failedSubs = subscriptions.filter((subscription) => subscription.failureCount > 0);

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [inbox, prefs, push] = await Promise.all([
        apiRequest<{ notifications: AppNotification[] }>("/notifications"),
        apiRequest<{ preferences: NotificationPreferences }>("/notifications/preferences"),
        apiRequest<{ subscriptions: PushSubscriptionStatus[] }>("/notifications/push-subscriptions")
      ]);

      setNotifications(inbox.notifications);
      setPreferences(prefs.preferences);
      setSubscriptions(push.subscriptions);
      emitUnread(inbox.notifications.filter((notification) => !notification.readAt).length);
    } catch (err) {
      setError(errorMessage(err, "Could not load notifications"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setPushStatus((current) => ({
      ...current,
      supported,
      permission: supported ? Notification.permission : "unsupported"
    }));

    if (!supported) {
      return;
    }

    // Keep worker readiness separate so the UI can identify the missing setup step.
    navigator.serviceWorker.ready
      .then(async (sw) => {
        const subscription = await sw.pushManager.getSubscription();

        setPushStatus(workerReadyUpdate(subscription));
      })
      .catch(() => {
        setPushStatus(markWorkerUnavailable);
      });
  }, []);

  async function markRead(id: string) {
    setSavingId(id);
    setError(null);
    setNotice(null);

    try {
      const { notification: saved } = await apiRequest<{ notification: AppNotification }>(`/notifications/${id}/read`, {
        method: "PATCH"
      });

      setNotifications((current) => replaceNotification(current, id, saved));
      emitUnread(Math.max(0, unreadCount - 1));
      setNotice("Notification marked as read.");
    } catch (err) {
      setError(errorMessage(err, "Could not mark notification as read"));
    } finally {
      setSavingId(null);
    }
  }

  async function updatePreference(key: TogglePreferenceKey) {
    setSavingPref(key);
    setError(null);
    setNotice(null);

    try {
      const { preferences: saved } = await apiRequest<{ preferences: NotificationPreferences }>(
        "/notifications/preferences",
        {
          method: "PATCH",
          body: JSON.stringify({ [key]: !preferences[key] })
        }
      );

      setPreferences(saved);
      setNotice("Notification preferences updated.");
    } catch (err) {
      setError(errorMessage(err, "Could not update notification preferences"));
    } finally {
      setSavingPref(null);
    }
  }

  async function saveQuietHours(disable = false) {
    const quietHoursStart = disable ? null : preferences.quietHoursStart;
    const quietHoursEnd = disable ? null : preferences.quietHoursEnd;

    if (!disable && (!quietHoursStart || !quietHoursEnd)) {
      setError("Choose both a start and an end time for quiet hours.");
      return;
    }

    setSavingHours(true);
    setError(null);
    setNotice(null);

    try {
      const { preferences: saved } = await apiRequest<{ preferences: NotificationPreferences }>(
        "/notifications/preferences",
        {
          method: "PATCH",
          body: JSON.stringify({ quietHoursStart, quietHoursEnd })
        }
      );
      setPreferences(saved);
      setNotice(disable ? "Quiet hours disabled." : "Quiet hours updated.");
    } catch (err) {
      setError(errorMessage(err, "Could not update quiet hours"));
    } finally {
      setSavingHours(false);
    }
  }

  async function enablePush() {
    setError(null);
    setNotice(null);
    setSavingPush(true);

    try {
      if (!pushStatus.supported) {
        setError("This browser does not support web push notifications.");
        return;
      }

      if (!vapidPublicKey) {
        setError("Push subscription storage needs NEXT_PUBLIC_VAPID_PUBLIC_KEY before the browser can subscribe.");
        return;
      }

      const permission = await Notification.requestPermission();
      setPushStatus((current) => ({ ...current, permission }));

      if (permission !== "granted") {
        setNotice("Push permission was not granted.");
        return;
      }

      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      const subscription =
        existing ??
        (await sw.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(vapidPublicKey)
        }));

      const { subscription: saved } = await apiRequest<{ subscription: PushSubscriptionStatus }>(
        "/notifications/push-subscriptions",
        {
          method: "POST",
          body: JSON.stringify(subscription.toJSON())
        }
      );
      setSubscriptions((current) => addSubscription(current, saved));

      setPushStatus((current) => ({
        ...current,
        serviceWorkerReady: true,
        subscribed: true,
        stored: true
      }));

      if (!preferences.pushNotifications) {
        setPreferences((current) => ({ ...current, pushNotifications: true }));
      }

      setNotice("Browser push subscription saved.");
    } catch (err) {
      setError(errorMessage(err, "Could not save browser push subscription"));
    } finally {
      setSavingPush(false);
    }
  }

  async function removePush() {
    setError(null);
    setNotice(null);
    setSavingPush(true);

    try {
      const sw = await navigator.serviceWorker.ready;
      const subscription = await sw.pushManager.getSubscription();

      if (!subscription) {
        setPushStatus((current) => ({
          ...current,
          subscribed: false,
          stored: false
        }));
        setNotice("This browser does not have an active push subscription.");
        return;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const { preferences: saved } = await apiRequest<{ preferences: NotificationPreferences }>(
        "/notifications/push-subscriptions",
        {
          method: "DELETE",
          body: JSON.stringify({ endpoint })
        }
      );

      setPreferences(saved);
      setSubscriptions((current) => disableSubscription(current, endpoint));
      setPushStatus((current) => ({
        ...current,
        subscribed: false,
        stored: false
      }));
      setNotice("Browser push subscription removed.");
    } catch (err) {
      setError(errorMessage(err, "Could not remove browser push subscription"));
    } finally {
      setSavingPush(false);
    }
  }

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Notifications" title="Notification inbox">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard icon={Inbox} iconClass="text-violet" label="Total" metric={notifications.length} />
        <StatCard icon={Bell} iconClass="text-ember" label="Unread" metric={unreadCount} />
        <StatCard icon={CheckCircle2} iconClass="text-mint" label="Read" metric={readCount} />
        <StatCard icon={Trophy} iconClass="text-violet" label="Achievements" metric={achievementItems.length} />
      </section>

      <PageSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <NotificationHeading
            description="These switches prepare notification routing before push delivery is added."
            icon={Settings2}
            iconClass="bg-violet/12 text-violet"
            section
            title="Preferences"
          />
          <PanelTag>
            {preferences.inAppEnabled ? "Inbox on" : "Inbox off"}
          </PanelTag>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {preferenceOptions.map((option) => {
            const enabled = preferences[option.key];

            return (
              <button
                className="flex min-h-24 items-center justify-between gap-4 rounded-lg border border-ink/8 bg-white p-4 text-left transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={savingPref === option.key}
                key={option.key}
                onClick={() => void updatePreference(option.key)}
                type="button"
              >
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="mt-1 block text-sm leading-5 text-ink/55">{option.detail}</span>
                </span>
                <span
                  className={clsx(
                    "flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition",
                    enabled ? "justify-end bg-mint" : "justify-start bg-ink/15"
                  )}
                >
                  <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sky/10 text-sky">
              <Clock3 size={19} />
            </span>
            <div>
              <h3 className="font-bold">Quiet hours</h3>
              <SupportingText spaced>
                Reminder delivery waits until this local-time window has ended.
              </SupportingText>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] sm:items-end">
            <QuietHourField
              id="quiet-hours-start"
              label="Starts"
              onChange={(event) =>
                setPreferences((current) => ({ ...current, quietHoursStart: event.target.value || null }))
              }
              value={preferences.quietHoursStart ?? ""}
            />
            <QuietHourField
              id="quiet-hours-end"
              label="Ends"
              onChange={(event) =>
                setPreferences((current) => ({ ...current, quietHoursEnd: event.target.value || null }))
              }
              value={preferences.quietHoursEnd ?? ""}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={savingHours} onClick={() => void saveQuietHours()} type="button" variant="secondary">
                Save window
              </Button>
              <Button disabled={savingHours} onClick={() => void saveQuietHours(true)} type="button" variant="ghost">
                Disable
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-ink/8 bg-paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <NotificationHeading
              description="Stores this browser for future provider-backed delivery."
              icon={Satellite}
              iconClass="bg-ember/12 text-ember"
              title="Push readiness"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!pushStatus.supported || !pushStatus.configured || pushStatus.stored || savingPush}
                onClick={() => void enablePush()}
                type="button"
                variant="secondary"
              >
                Save browser subscription
              </Button>
              <Button
                disabled={!pushStatus.supported || (!pushStatus.subscribed && !pushStatus.stored) || savingPush}
                onClick={() => void removePush()}
                type="button"
                variant="ghost"
              >
                Remove browser subscription
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Readout label="Support" metric={pushStatus.supported ? "Available" : "Unavailable"} />
            <Readout label="Key" metric={pushStatus.configured ? "Configured" : "Missing"} />
            <Readout label="Permission" metric={pushStatus.permission} />
            <Readout label="Worker" metric={pushStatus.serviceWorkerReady ? "Ready" : "Pending"} />
            <Readout label="Stored" metric={pushStatus.stored ? "Saved" : "Not saved"} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Readout label="Active devices" metric={activeSubs.length} />
            <Readout label="Failures" metric={failedSubs.length} />
            <Readout label="Preference" metric={preferences.pushNotifications ? "Enabled" : "Disabled"} />
          </div>

          <div className="mt-4 rounded-lg border border-ink/8 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold">Stored browser subscriptions</h4>
                <SupportingText spaced>Backend lifecycle state for this account.</SupportingText>
              </div>
              <Button disabled={loading} onClick={() => void loadNotifications()} type="button" variant="ghost">
                <RotateCw size={17} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-2">
              {loading ? (
                <InboxMessage>Loading push subscriptions...</InboxMessage>
              ) : subscriptions.length === 0 ? (
                <InboxMessage>No stored browser subscriptions yet.</InboxMessage>
              ) : (
                subscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} />
                ))
              )}
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection>
        <PanelHeader>
          <div>
            <SectionHeading>Recent notifications</SectionHeading>
            <SupportingText spaced>Quest rewards, achievement unlocks, insights, and guild updates land here.</SupportingText>
          </div>
          <PanelTag>
            {unreadCount} unread
          </PanelTag>
        </PanelHeader>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet/15 bg-violet/5 p-4">
          <NotificationHeading
            description={
              <>
                {achievementItems.length} unlock message{achievementItems.length === 1 ? "" : "s"} delivered
                {unreadAchievements > 0 ? ` / ${unreadAchievements} unread` : ""}
              </>
            }
            icon={Trophy}
            iconClass="bg-violet text-white"
            iconSize={19}
            title="Achievement delivery"
          />
          <AchievementLink label="Achievement hall" />
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            <InboxMessage>Loading notifications...</InboxMessage>
          ) : notifications.length === 0 ? (
            <InboxMessage>No notifications yet.</InboxMessage>
          ) : (
            notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onMarkRead={markRead}
                saving={savingId === notification.id}
              />
            ))
          )}
        </div>
      </PageSection>
    </AppShell>
  );
}

function SubscriptionCard({ subscription }: { subscription: PushSubscriptionStatus }) {
  const active = !subscription.disabledAt;

  return (
    <div className="rounded-md border border-ink/8 bg-paper px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-full truncate text-sm font-semibold text-ink/70">{subscription.endpoint}</span>
        <NotificationTag tone={active ? "bg-mint/10 text-mint" : "bg-ink/8 text-ink/45"}>
          {active ? "Active" : "Disabled"}
        </NotificationTag>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-ink/50 sm:grid-cols-3">
        <span>Failures {subscription.failureCount}</span>
        <span>Updated {formatDate(subscription.updatedAt)}</span>
        <span>{subscription.lastFailureAt ? `Last failure ${formatDate(subscription.lastFailureAt)}` : "No failures"}</span>
      </div>
      {subscription.userAgent && <p className="mt-2 truncate text-xs text-ink/40">{subscription.userAgent}</p>}
    </div>
  );
}

function NotificationCard({
  notification,
  onMarkRead,
  saving
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => Promise<void>;
  saving: boolean;
}) {
  const unread = !notification.readAt;
  const visual = categoryVisuals[notification.category];
  const Icon = visual.Icon;
  const isAchievement = notification.category === "ACHIEVEMENT";

  return (
    <article
      className={clsx(
        "rounded-lg border p-5 transition",
        unread ? "border-mint/25 bg-mint/5" : "border-ink/8 bg-white"
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            unread ? visual.activeClass : visual.mutedClass
          )}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{notification.title}</h3>
            <NotificationTag tone={unread ? "bg-mint/10 text-mint" : "bg-ink/8 text-ink/45"}>
              {unread ? "Unread" : "Read"}
            </NotificationTag>
            <NotificationTag capitalize tone={visual.chipClass}>
              {formatCategory(notification.category)}
            </NotificationTag>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/65">{notification.message}</p>
          <p className="mt-3 text-sm text-ink/45">
            Created {formatDate(notification.createdAt)}
            {notification.readAt ? ` / Read ${formatDate(notification.readAt)}` : ""}
          </p>
        </div>
      </div>

      {unread && (
        <div className="mt-4 border-t border-ink/8 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => void onMarkRead(notification.id)} type="button" variant="ghost">
              <Check size={18} />
              Mark as read
            </Button>
            {isAchievement && (
              <AchievementLink label="View achievement" />
            )}
          </div>
        </div>
      )}
    </article>
  );
}
