"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  Clock,
  Coins,
  Flag,
  Fingerprint,
  Flame,
  LogOut,
  Medal,
  Pickaxe,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserCircle2,
  Zap,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useRealtimeSocket } from "@/hooks/useRealtimeSocket";
import { apiRequest } from "@/lib/api";
import type { NotificationCountUpdatedPayload } from "@/lib/realtime";
import { useAuthStore } from "@/store/auth.store";
import type { AuthUser } from "@/types/auth";

const navGroups = [
  {
    label: "Journey",
    items: [
      { href: "/dashboard", label: "Command center", icon: Swords },
      { href: "/quests", label: "Quest log", icon: ScrollText },
      { href: "/focus", label: "Focus arena", icon: Clock }
    ]
  },
  {
    label: "Progress",
    items: [
      { href: "/profile", label: "Character", icon: UserCircle2 },
      { href: "/skills", label: "Skills", icon: Pickaxe },
      { href: "/achievements", label: "Achievements", icon: Medal },
      { href: "/rewards", label: "Reward vault", icon: Coins }
    ]
  },
  {
    label: "World",
    items: [
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/guilds", label: "Guilds", icon: Flag }
    ]
  },
  {
    label: "Intel",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/insights", label: "Insights", icon: BrainCircuit },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/abuse-reports", label: "Reports", icon: ShieldAlert }
    ]
  }
];

const adminNavItems = [
  { href: "/admin", label: "Admin console", icon: ShieldCheck },
  { href: "/admin/security", label: "Admin security", icon: Fingerprint }
];

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

function UnreadBadge({ count, bold = false }: { count: number; bold?: boolean }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className={clsx("rounded-md bg-ember px-1.5 py-0.5 text-[10px]", bold && "font-bold", "text-white")}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function MobileNavItem({ navItem, active, unreadCount }: { navItem: NavItem; active: boolean; unreadCount: number }) {
  const Icon = navItem.icon;

  return (
    <Link
      className={clsx(
        "lx-interactive relative flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-bold",
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/65"
      )}
      href={navItem.href}
    >
      <Icon size={16} />
      {navItem.label}
      {navItem.href === "/notifications" && <UnreadBadge count={unreadCount} />}
    </Link>
  );
}

function SidebarNavItem({ navItem, active, unreadCount }: { navItem: NavItem; active: boolean; unreadCount: number }) {
  const Icon = navItem.icon;

  return (
    <Link
      className={clsx(
        "lx-nav-item lx-interactive flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold",
        active ? "lx-nav-item-active bg-white text-ink" : "text-white/62 hover:bg-white/10 hover:text-white"
      )}
      href={navItem.href}
    >
      <Icon className="shrink-0" size={17} />
      <span className="min-w-0 flex-1 truncate">{navItem.label}</span>
      {navItem.href === "/notifications" && <UnreadBadge bold count={unreadCount} />}
    </Link>
  );
}

function HeaderStat({ icon: Icon, iconClass, label, metric }: { icon: LucideIcon; iconClass: string; label: string; metric: ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 shadow-panel">
      <Icon className={iconClass} size={17} />
      <span>
        <span className="block text-[10px] font-bold uppercase text-ink/38">{label}</span>
        <span className="block text-sm font-bold">{metric}</span>
      </span>
    </div>
  );
}

function MobileHeader({
  isActive,
  level,
  navItems,
  onSignOut,
  playerClass,
  unreadCount
}: {
  isActive: (href: string) => boolean;
  level: number;
  navItems: NavItem[];
  onSignOut: () => Promise<void>;
  playerClass: string;
  unreadCount: number;
}) {
  return (
    <div className="mb-4 lg:hidden">
      <div className="flex items-center justify-between rounded-md border border-ink bg-ink px-3 py-3 text-white shadow-command">
        <Link className="flex min-w-0 items-center gap-3" href="/dashboard">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-mint text-white">
            <Zap size={19} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">LevelUpX</span>
            <span className="block truncate text-xs text-white/55">Level {level} {playerClass}</span>
          </span>
        </Link>
        <button
          aria-label="Log out"
          className="lx-button flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => void onSignOut()}
          type="button"
        >
          <LogOut size={17} />
        </button>
      </div>
      <nav className="mt-2 flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-2" aria-label="Mobile navigation">
        {navItems.map((navItem) => (
          <MobileNavItem active={isActive(navItem.href)} key={navItem.href} navItem={navItem} unreadCount={unreadCount} />
        ))}
      </nav>
    </div>
  );
}

function DesktopSidebar({
  groups,
  initials,
  isActive,
  level,
  levelProgress,
  levelXp,
  onSignOut,
  playerClass,
  unreadCount,
  userName
}: {
  groups: NavGroup[];
  initials: string;
  isActive: (href: string) => boolean;
  level: number;
  levelProgress: number;
  levelXp: number;
  onSignOut: () => Promise<void>;
  playerClass: string;
  unreadCount: number;
  userName: string;
}) {
  return (
    <aside className="hidden lg:sticky lg:top-5 lg:block lg:h-[calc(100vh-40px)]">
      <div className="flex h-full flex-col rounded-md border border-ink bg-ink p-3 text-white shadow-command">
        <Link className="flex items-center gap-3 px-2 py-2" href="/dashboard">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-mint text-white shadow-action">
            <Zap size={20} />
          </span>
          <span>
            <span className="block text-lg font-bold">LevelUpX</span>
            <span className="block text-xs font-semibold text-white/45">Quest command system</span>
          </span>
        </Link>

        <div className="my-3 border-y border-white/10 px-2 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/10 text-sm font-bold">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{userName}</span>
              <span className="block truncate text-xs text-white/45">Level {level} {playerClass}</span>
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-white/55">
              <span>Next level</span>
              <span>{levelXp}/1000 XP</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-white/10">
              <div
                aria-label={`${levelProgress}% progress to next level`}
                className="lx-progress-fill h-full rounded-md bg-mint"
                role="progressbar"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Primary navigation">
          {groups.map((group) => (
            <div className="mb-4" key={group.label}>
              <p className="mb-1 px-3 text-[11px] font-bold uppercase text-white/32">{group.label}</p>
              <div className="grid gap-1">
                {group.items.map((navItem) => (
                  <SidebarNavItem active={isActive(navItem.href)} key={navItem.href} navItem={navItem} unreadCount={unreadCount} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <Button
          className="mt-2 w-full justify-start border-white/10 text-white/65 hover:border-white/15 hover:bg-white/10 hover:text-white"
          onClick={() => void onSignOut()}
          variant="ghost"
        >
          <LogOut size={17} />
          Log out
        </Button>
      </div>
    </aside>
  );
}

function PlayerHeader({
  eyebrow,
  level,
  levelProgress,
  playerClass,
  profile,
  title,
  totalXp,
  xpToNextLevel
}: {
  eyebrow: string;
  level: number;
  levelProgress: number;
  playerClass: string;
  profile: AuthUser["profile"] | undefined;
  title: string;
  totalXp: number;
  xpToNextLevel: number;
}) {
  return (
    <header className="lx-page-enter mb-6 border-b border-line pb-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-mint">
            <Sparkles size={16} />
            <span>{eyebrow}</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm font-medium text-ink/48">
            {playerClass} / Level {level} / {xpToNextLevel} XP to next level
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <HeaderStat icon={Flame} iconClass="text-ember" label="Streak" metric={`${profile?.currentStreak ?? 0} days`} />
          <HeaderStat icon={Coins} iconClass="text-gold" label="Coins" metric={profile?.coins ?? 0} />
          <HeaderStat icon={Zap} iconClass="text-violet" label="Total XP" metric={totalXp} />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <span className="text-xs font-bold text-ink/45">LEVEL {level}</span>
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-md bg-line">
          <div
            aria-label={`${levelProgress}% progress to next level`}
            className="lx-progress-fill h-full rounded-md bg-mint"
            role="progressbar"
            style={{ width: `${levelProgress}%` }}
          />
        </div>
        <span className="text-xs font-bold text-ink/45">LEVEL {level + 1}</span>
      </div>
    </header>
  );
}

export function AppShell({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const groups = isAdmin ? [...navGroups, { label: "System", items: adminNavItems }] : navGroups;
  const navItems = groups.flatMap((group) => group.items);

  const profile = user?.profile;
  const level = profile?.level ?? 1;
  const totalXp = profile?.totalXp ?? 0;
  const levelXp = totalXp % 1000;
  const levelProgress = Math.min(100, Math.round((levelXp / 1000) * 100));
  const xpToNextLevel = levelXp === 0 && totalXp > 0 ? 1000 : 1000 - levelXp;
  const playerClass = profile?.selectedCharacterClass?.name ?? "Adventurer";
  const initials = (user?.name ?? "Player")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const loadUnread = useCallback(async () => {
    if (!accessToken) {
      setUnreadCount(0);
      return;
    }

    try {
      const unread = await apiRequest<{ unreadCount: number }>("/notifications/unread-count");
      setUnreadCount(unread.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  }, [accessToken]);

  const handlers = useMemo(
    () => ({
      connect: () => void loadUnread(),
      "notification.count.updated": (countUpdate: NotificationCountUpdatedPayload) => {
        setUnreadCount(countUpdate.unreadCount);
      }
    }),
    [loadUnread]
  );

  useRealtimeSocket({
    accessToken,
    handlers
  });

  useEffect(() => {
    void loadUnread();

    if (!accessToken) {
      return;
    }

    const timer = window.setInterval(() => void loadUnread(), 60_000);
    const onNotificationsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ unreadCount?: number }>).detail;

      if (typeof detail?.unreadCount === "number") {
        setUnreadCount(detail.unreadCount);
        return;
      }

      void loadUnread();
    };

    window.addEventListener("levelupx:notifications-changed", onNotificationsChanged);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("levelupx:notifications-changed", onNotificationsChanged);
    };
  }, [accessToken, loadUnread]);

  async function signOut() {
    try {
      await apiRequest("/auth/logout", { method: "POST", auth: false });
    } finally {
      logout();
      router.replace("/login");
    }
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <main className="min-h-screen bg-paper px-3 py-3 text-ink sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1480px]">
        <MobileHeader
          isActive={isActive}
          level={level}
          navItems={navItems}
          onSignOut={signOut}
          playerClass={playerClass}
          unreadCount={unreadCount}
        />

        <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <DesktopSidebar
            groups={groups}
            initials={initials}
            isActive={isActive}
            level={level}
            levelProgress={levelProgress}
            levelXp={levelXp}
            onSignOut={signOut}
            playerClass={playerClass}
            unreadCount={unreadCount}
            userName={user?.name ?? "Player"}
          />

          <section className="min-w-0">
            <PlayerHeader
              eyebrow={eyebrow}
              level={level}
              levelProgress={levelProgress}
              playerClass={playerClass}
              profile={profile}
              title={title}
              totalXp={totalXp}
              xpToNextLevel={xpToNextLevel}
            />

            <div className="lx-content-enter">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
