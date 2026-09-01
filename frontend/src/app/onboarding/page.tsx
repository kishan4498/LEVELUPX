"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  GraduationCap,
  Heart,
  Shield,
  Sparkles,
  Swords,
  Target,
  Zap,
  type LucideIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RouteFallback } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import { trackProductEvent } from "@/lib/productEvents";
import { useAuthStore } from "@/store/auth.store";
import type { AuthUser } from "@/types/auth";
import type { CharacterClass } from "@/types/profile";

type ProductivityMode = "STUDENT" | "PROFESSIONAL" | "PERSONAL";

const modes = [
  {
    value: "STUDENT" as const,
    label: "Study",
    detail: "Classes, exams, and deliberate practice",
    icon: GraduationCap,
    tone: "text-violet bg-violet/10"
  },
  {
    value: "PROFESSIONAL" as const,
    label: "Work",
    detail: "Projects, craft, and consistent delivery",
    icon: BriefcaseBusiness,
    tone: "text-sky bg-sky/10"
  },
  {
    value: "PERSONAL" as const,
    label: "Life",
    detail: "Habits, health, and personal ambitions",
    icon: Heart,
    tone: "text-ember bg-ember/10"
  }
];

const steps = ["Intent", "Rhythm", "First quest"];

export default function OnboardingPage() {
  const router = useRouter();
  const { accessToken, user } = useRequireAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const trackedStart = useRef(false);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<ProductivityMode>("PERSONAL");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [dailyGoal, setDailyGoal] = useState(60);
  const [classes, setClasses] = useState<CharacterClass[]>([]);
  const [classId, setClassId] = useState("");
  const [firstQuest, setFirstQuest] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    if (user.role !== "USER") {
      router.replace("/admin/security");
      return;
    }

    if (user.profile?.onboardingCompletedAt) {
      router.replace("/dashboard");
      return;
    }

    if (!trackedStart.current) {
      trackedStart.current = true;
      void trackProductEvent("onboarding_started");
    }

    apiRequest<{ characterClasses: CharacterClass[] }>("/users/character-classes")
      .then((classList) => {
        setClasses(classList.characterClasses);
        setClassId(classList.characterClasses[0]?.id ?? "");
      })
      .catch((err) => setError(errorMessage(err, "Could not load character classes")))
      .finally(() => setLoading(false));
  }, [accessToken, router, user]);

  async function finish() {
    if (!user || firstQuest.trim().length < 3) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const onboarding = await apiRequest<{ user: { profile: AuthUser["profile"] } }>("/users/me/onboarding", {
        method: "PATCH",
        body: JSON.stringify({
          timezone,
          productivityMode: mode,
          preferredFocusMinutes: focusMinutes,
          dailyGoalMinutes: dailyGoal,
          ...(classId ? { characterClassId: classId } : {})
        })
      });

      await apiRequest("/quests", {
        method: "POST",
        body: JSON.stringify({
          title: firstQuest.trim(),
          difficulty: "EASY",
          category: mode === "STUDENT" ? "Study" : mode === "PROFESSIONAL" ? "Work" : "Personal",
          estimatedMinutes: focusMinutes,
          priority: "HIGH",
          tags: ["first-run"]
        })
      });

      setUser({ ...user, profile: onboarding.user.profile });
      await Promise.all([
        trackProductEvent("onboarding_completed", {
          mode,
          focusMinutes,
          dailyGoalMinutes: dailyGoal,
          selectedClass: Boolean(classId)
        }),
        trackProductEvent("quest_created", { source: "onboarding", difficulty: "EASY" })
      ]);
      router.replace("/dashboard");
    } catch (err) {
      setError(errorMessage(err, "Could not finish setup"));
    } finally {
      setSaving(false);
    }
  }

  if (!accessToken || !user || user.role !== "USER") {
    return <RouteFallback />;
  }

  const selectedClass = classes.find((classOption) => classOption.id === classId);
  const selectedMode = modes.find((modeOption) => modeOption.value === mode);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink bg-ink px-5 py-4 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-mint">
              <Zap size={18} />
            </span>
            <div>
              <p className="font-bold">LevelUpX</p>
              <p className="text-xs text-white/45">Build your first run</p>
            </div>
          </div>
          <p className="text-sm font-semibold text-white/55">Step {step + 1} of {steps.length}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-12">
        <section className="min-w-0">
          <div className="mb-8 grid grid-cols-3 border-b border-line">
            {steps.map((label, index) => (
              <div
                className={clsx("relative pb-3 text-sm font-bold", index <= step ? "text-ink" : "text-ink/35")}
                key={label}
              >
                <span>{label}</span>
                <span
                  className={clsx(
                    "absolute inset-x-0 -bottom-px h-0.5",
                    index <= step ? "bg-mint" : "bg-transparent"
                  )}
                />
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="lx-page-enter">
              <p className="text-sm font-bold text-mint">Choose your arena</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">What are you leveling up?</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/55">
                Your choice tunes labels and starting defaults. Every feature remains available.
              </p>

              <div className="mt-7 grid gap-3 md:grid-cols-3">
                {modes.map((modeOption) => (
                  <ModeCard
                    key={modeOption.value}
                    mode={modeOption}
                    onSelect={setMode}
                    selected={mode === modeOption.value}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="lx-page-enter">
              <p className="text-sm font-bold text-sky">Set a sustainable rhythm</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Make the plan fit real life</h1>

              <div className="mt-8 grid gap-7">
                <RangeControl
                  icon={Clock3}
                  label="Preferred focus block"
                  max={90}
                  min={10}
                  step={5}
                  suffix="min"
                  minutes={focusMinutes}
                  onChange={setFocusMinutes}
                />
                <RangeControl
                  icon={Target}
                  label="Daily focus target"
                  max={240}
                  min={15}
                  step={15}
                  suffix="min"
                  minutes={dailyGoal}
                  onChange={setDailyGoal}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="lx-page-enter">
              <p className="text-sm font-bold text-violet">Choose a class and commit</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Name the first clear win</h1>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {classes.map((classOption) => (
                  <ClassCard
                    characterClass={classOption}
                    key={classOption.id}
                    onSelect={setClassId}
                    selected={classOption.id === classId}
                  />
                ))}
              </div>

              <div className="mt-7 max-w-xl">
                <Input
                  label="First quest"
                  name="firstQuest"
                  placeholder="Finish one concrete outcome"
                  value={firstQuest}
                  onChange={(event) => setFirstQuest(event.target.value)}
                />
              </div>
            </div>
          )}

          {error && <p className="mt-6 rounded-md border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>}

          <div className="mt-9 flex items-center justify-between border-t border-line pt-5">
            <Button
              disabled={step === 0 || saving}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              variant="ghost"
            >
              <ArrowLeft size={17} />
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button
                disabled={loading}
                onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}
              >
                Continue
                <ArrowRight size={17} />
              </Button>
            ) : (
              <Button
                disabled={saving || loading || firstQuest.trim().length < 3}
                onClick={() => void finish()}
              >
                <Swords size={18} />
                {saving ? "Building your run" : "Start first run"}
              </Button>
            )}
          </div>
        </section>

        <aside className="h-fit rounded-md border border-ink bg-ink p-5 text-white shadow-command lg:sticky lg:top-8">
          <div className="flex items-center gap-2 text-sm font-bold text-mint">
            <Sparkles size={16} />
            Starting loadout
          </div>
          <dl className="mt-5 divide-y divide-white/10 border-y border-white/10">
            <LoadoutRow detail={selectedMode?.label ?? "Life"} label="Mode" />
            <LoadoutRow detail={focusMinutes + " minutes"} label="Focus block" />
            <LoadoutRow detail={dailyGoal + " minutes"} label="Daily target" />
            <LoadoutRow detail={selectedClass?.name ?? "Adventurer"} label="Character" />
          </dl>
          <div className="mt-5 rounded-md bg-white/5 p-4">
            <p className="text-xs font-bold uppercase text-white/40">Daily target</p>
            <p className="mt-2 text-2xl font-bold">{Math.max(1, Math.ceil(dailyGoal / focusMinutes))}</p>
            <p className="mt-1 text-xs text-white/45">focus blocks</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ModeCard({
  mode,
  onSelect,
  selected
}: {
  mode: (typeof modes)[number];
  onSelect: (mode: ProductivityMode) => void;
  selected: boolean;
}) {
  const Icon = mode.icon;

  return (
    <button
      aria-pressed={selected}
      className={clsx(
        "lx-interactive min-h-[160px] rounded-md border p-4 text-left",
        selected ? "border-ink bg-ink text-white shadow-command" : "border-line bg-white hover:border-mint"
      )}
      onClick={() => onSelect(mode.value)}
      type="button"
    >
      <span
        className={clsx(
          "flex h-10 w-10 items-center justify-center rounded-md",
          selected ? "bg-mint text-white" : mode.tone
        )}
      >
        <Icon size={19} />
      </span>
      <span className="mt-5 block text-lg font-bold">{mode.label}</span>
      <span className={clsx("mt-2 block text-sm leading-6", selected ? "text-white/55" : "text-ink/50")}>
        {mode.detail}
      </span>
    </button>
  );
}

function ClassCard({
  characterClass,
  onSelect,
  selected
}: {
  characterClass: CharacterClass;
  onSelect: (classId: string) => void;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={clsx(
        "lx-interactive flex min-h-[112px] items-start gap-3 rounded-md border p-4 text-left",
        selected ? "border-violet bg-violet/5" : "border-line bg-white hover:border-violet/40"
      )}
      onClick={() => onSelect(characterClass.id)}
      type="button"
    >
      <span
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          selected ? "bg-violet text-white" : "bg-violet/10 text-violet"
        )}
      >
        <Shield size={17} />
      </span>
      <span>
        <span className="flex items-center gap-2 font-bold">
          {characterClass.name}
          {selected && <Check className="text-violet" size={15} />}
        </span>
        <span className="mt-1 block text-xs leading-5 text-ink/50">{characterClass.description}</span>
      </span>
    </button>
  );
}

function RangeControl({
  icon: Icon,
  label,
  min,
  max,
  step,
  suffix,
  minutes,
  onChange
}: {
  icon: LucideIcon;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-sky/10 text-sky">
            <Icon size={19} />
          </span>
          <span className="font-bold">{label}</span>
        </div>
        <span className="min-w-[86px] text-right text-2xl font-bold">{minutes} {suffix}</span>
      </div>
      <input
        aria-label={label}
        className="mt-6 w-full accent-mint"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={minutes}
      />
      <div className="mt-2 flex justify-between text-xs font-semibold text-ink/35">
        <span>{min} {suffix}</span>
        <span>{max} {suffix}</span>
      </div>
    </div>
  );
}

function LoadoutRow({ detail, label }: { detail: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <dt className="text-white/45">{label}</dt>
      <dd className="text-right font-bold">{detail}</dd>
    </div>
  );
}
