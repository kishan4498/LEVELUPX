"use client";

import { clsx } from "clsx";
import { AlertCircle, ArrowRight, Lock, Pickaxe, Sparkles, Target, TrendingUp, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { RouteFallback, SupportingText } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import type { Skill } from "@/types/profile";

export default function SkillsPage() {
  const { accessToken } = useRequireAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unlocked = skills.filter((skill) => skill.unlocked);
  const levels = unlocked.reduce((sum, skill) => sum + skill.currentLevel, 0);
  const maxLevels = skills.reduce((sum, skill) => sum + skill.maxLevel, 0);
  const mastery = maxLevels > 0 ? Math.round((levels / maxLevels) * 100) : 0;
  const nextSkill =
    [...skills]
      .filter((skill) => !skill.locked && skill.progressPercent < 100)
      .sort((left, right) => right.progressPercent - left.progressPercent)[0] ?? null;

  const loadSkills = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { skills } = await apiRequest<{ skills: Skill[] }>("/users/skills");
      setSkills(skills);
    } catch (err) {
      setError(errorMessage(err, "Could not load skills"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  if (!accessToken) {
    return <RouteFallback />;
  }

  return (
    <AppShell eyebrow="Mastery Path" title="Skill tree">
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-md border border-ember/20 bg-ember/10 px-4 py-3 text-sm font-semibold text-ember">
          <AlertCircle className="mt-0.5 shrink-0" size={17} />
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-md border border-ink bg-ink text-white shadow-command">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-6 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-bold text-mint">
              <Pickaxe size={17} />
              <span>Mastery overview</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{mastery}% of available mastery earned</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Skills grow from the work already happening across quests, focus, streaks, guild activity, and recovery.
            </p>
            <div className="mt-6 h-2 overflow-hidden rounded-md bg-white/10">
              <div
                aria-label={`${mastery}% of available mastery earned`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={mastery}
                className="lx-progress-fill h-full rounded-md bg-mint"
                role="progressbar"
                style={{ width: `${mastery}%` }}
              />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Metric label="Unlocked" metric={`${unlocked.length}/${skills.length}`} />
              <Metric label="Levels earned" metric={String(levels)} />
              <Metric label="Potential" metric={String(maxLevels)} />
            </div>
          </div>

          <aside className="border-t border-white/10 bg-white/5 p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase text-white/45">Closest advancement</p>
            {nextSkill ? (
              <>
                <span className="mt-5 flex h-10 w-10 items-center justify-center rounded-md bg-violet text-white">
                  <Target size={19} />
                </span>
                <h3 className="mt-4 text-lg font-bold">{nextSkill.name}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{nextSkill.ruleLabel}</p>
                <p className="mt-4 text-sm font-bold text-mint">{nextSkill.progressPercent}% toward next milestone</p>
              </>
            ) : (
              <>
                <Trophy className="mt-5 text-gold" size={25} />
                <h3 className="mt-4 font-bold">Current path mastered</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">Every available skill milestone has been reached.</p>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm font-bold text-violet">
            <TrendingUp size={17} />
            <span>Mastery paths</span>
          </div>
          <h2 className="mt-1 text-xl font-bold">Progress built from real activity</h2>
          <SupportingText spaced>Each path names the behavior that moves it forward and the next visible target.</SupportingText>
        </div>

        <div className="overflow-hidden rounded-md border border-line bg-white shadow-panel">
          {loading ? (
            <div className="flex min-h-[120px] items-center gap-3 p-5 text-sm font-semibold text-ink/55">
              <Sparkles className="text-violet" size={18} />
              Reading your mastery paths...
            </div>
          ) : skills.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-start justify-center p-6">
              <Lock className="text-ink/35" size={22} />
              <h3 className="mt-4 font-bold">No mastery paths available yet</h3>
              <SupportingText spaced>New skill definitions will appear here when they are added to the system.</SupportingText>
            </div>
          ) : (
            skills.map((skill, index) => <SkillPath index={index} key={skill.id} skill={skill} />)
          )}
        </div>
      </section>
    </AppShell>
  );
}

function SkillPath({ index, skill }: { index: number; skill: Skill }) {
  const progress = Math.max(0, Math.min(100, skill.progressPercent));
  const visual = skillVisual(skill);
  const Icon = visual.icon;

  return (
    <article className="grid gap-4 border-b border-line p-5 last:border-b-0 lg:grid-cols-[48px_minmax(0,1fr)_180px] lg:items-center">
      <span className={clsx("flex h-11 w-11 items-center justify-center rounded-md", visual.iconClass)}>
        <Icon size={visual.iconSize} />
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-ink/35">PATH {String(index + 1).padStart(2, "0")}</span>
          <h3 className="font-bold">{skill.name}</h3>
          <span className={clsx("rounded-md px-2 py-0.5 text-[10px] font-bold", visual.badgeClass)}>
            {visual.status}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink/55">{skill.description}</p>
        {skill.prerequisite && (
          <p className={clsx("mt-2 text-xs font-semibold", skill.locked ? "text-ember" : "text-ink/45")}>
            Requires {skill.prerequisite.name} level {skill.prerequisite.minimumLevel}
            {skill.locked ? ` (${skill.prerequisite.currentLevel} reached)` : " (met)"}
          </p>
        )}
        {skill.lockedReason && <p className="mt-1 text-xs text-ember">{skill.lockedReason}</p>}
        <div className="mt-4 h-2 overflow-hidden rounded-md bg-paper">
          <div
            aria-label={`${progress}% progress for ${skill.name}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className={clsx("lx-progress-fill h-full rounded-md", visual.progressClass)}
            role="progressbar"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="rounded-md border border-line bg-paper p-3">
        <p className="text-xs font-bold text-ink/45">{skill.ruleLabel}</p>
        <p className="mt-1 text-lg font-bold">
          {skill.currentValue}
          <span className="text-sm text-ink/35">{skill.nextLevelTarget ? ` / ${skill.nextLevelTarget}` : ""}</span>
        </p>
        <div className="mt-2 flex items-center justify-between text-xs font-bold">
          <span className="text-violet">Level {skill.currentLevel}/{skill.maxLevel}</span>
          <span className="inline-flex items-center gap-1 text-ink/45">{progress}% <ArrowRight size={12} /></span>
        </div>
      </div>
    </article>
  );
}

function skillVisual(skill: Skill) {
  if (skill.locked) {
    return {
      badgeClass: "bg-ember/10 text-ember",
      icon: Lock,
      iconClass: "bg-ember/10 text-ember",
      iconSize: 19,
      progressClass: "bg-ember/40",
      status: "Prerequisite locked"
    };
  }

  if (skill.nextLevelTarget === null && skill.unlocked) {
    return {
      badgeClass: "bg-mint/10 text-mint",
      icon: Trophy,
      iconClass: "bg-ink text-white",
      iconSize: 20,
      progressClass: "bg-ink",
      status: "Mastered"
    };
  }

  if (skill.unlocked) {
    return {
      badgeClass: "bg-mint/10 text-mint",
      icon: Pickaxe,
      iconClass: "bg-mint/10 text-mint",
      iconSize: 20,
      progressClass: "bg-mint",
      status: "Unlocked"
    };
  }

  return {
    badgeClass: "bg-paper text-ink/45",
    icon: Lock,
    iconClass: "bg-paper text-ink/35",
    iconSize: 19,
    progressClass: "bg-violet",
    status: "Locked"
  };
}

function Metric({ label, metric }: { label: string; metric: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-white/45">{label}</p>
      <p className="mt-1 text-xl font-bold">{metric}</p>
    </div>
  );
}
