"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coins,
  BellRing,
  FolderKanban,
  FolderPlus,
  Flag,
  GitBranch,
  Loader2,
  Medal,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  Tags,
  TimerReset,
  Trophy
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ChangeEventHandler, type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RouteFallback, SupportingText } from "@/components/ui/PagePrimitives";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiRequest, errorMessage } from "@/lib/api";
import { trackProductEvent } from "@/lib/productEvents";
import { useAuthStore } from "@/store/auth.store";
import type {
  Project,
  Quest,
  QuestCompletionResponse,
  QuestDifficulty,
  QuestPriority,
  QuestRecurrence,
  QuestStatus
} from "@/types/quest";

const difficulties: QuestDifficulty[] = ["EASY", "MEDIUM", "HARD", "BOSS", "RECOVERY"];
const priorities: QuestPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const recurrenceOptions: QuestRecurrence[] = ["NONE", "DAILY", "WEEKDAYS", "WEEKLY", "MONTHLY"];
const filters = ["ACTIVE", "COMPLETED", "FAILED"] as const;
type QuestFilter = (typeof filters)[number];

const difficultyDetails: Record<QuestDifficulty, { description: string; tone: string }> = {
  EASY: { description: "A quick win to build momentum.", tone: "bg-mint/10 text-mint" },
  MEDIUM: { description: "Meaningful work with a clear finish.", tone: "bg-violet/10 text-violet" },
  HARD: { description: "A demanding objective worth protecting time for.", tone: "bg-gold/10 text-gold" },
  BOSS: { description: "A major milestone that deserves a deliberate run.", tone: "bg-ember/10 text-ember" },
  RECOVERY: { description: "A gentle reset that keeps the streak alive.", tone: "bg-sky/10 text-sky" }
};

const statusStyles: Record<QuestStatus, string> = {
  PENDING: "bg-violet/10 text-violet",
  IN_PROGRESS: "bg-mint/10 text-mint",
  COMPLETED: "bg-ink text-white",
  FAILED: "bg-ember/10 text-ember",
  ARCHIVED: "bg-ink/10 text-ink/60"
};

const priorityStyles: Record<QuestPriority, string> = {
  LOW: "bg-sky/10 text-sky",
  MEDIUM: "bg-gold/10 text-gold",
  HIGH: "bg-ember/10 text-ember",
  CRITICAL: "bg-ink text-white"
};

const rewardWeights: Record<QuestDifficulty, number> = {
  EASY: 1,
  MEDIUM: 1.25,
  HARD: 1.75,
  BOSS: 2.5,
  RECOVERY: 0.75
};

const achievementRewardClasses = {
  xp: "rounded-md bg-violet/10 px-2 py-1 text-violet",
  coins: "rounded-md bg-gold/10 px-2 py-1 text-gold"
} as const;

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const reminderDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

type AbusePromptSignal = QuestCompletionResponse["abuseReports"][number];
type UnlockedAchievementSignal = QuestCompletionResponse["unlockedAchievements"][number];

export default function QuestsPage() {
  const { accessToken, user } = useRequireAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuestFilter>("ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [abuseSignals, setAbuseSignals] = useState<AbusePromptSignal[]>([]);
  const [achievementSignals, setAchievementSignals] = useState<UnlockedAchievementSignal[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<QuestDifficulty>("EASY");
  const [category, setCategory] = useState("General");
  const [minutes, setMinutes] = useState(25);
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [parentId, setParentId] = useState("");
  const [priority, setPriority] = useState<QuestPriority>("MEDIUM");
  const [tagText, setTagText] = useState("");
  const [recurrence, setRecurrence] = useState<QuestRecurrence>("NONE");
  const [reminderAt, setReminderAt] = useState("");
  const [projectName, setProjectName] = useState("");
  const [addingProject, setAddingProject] = useState(false);

  const questCounts = useMemo(
    () => ({
      ACTIVE: quests.filter((quest) => quest.status === "PENDING" || quest.status === "IN_PROGRESS").length,
      COMPLETED: quests.filter((quest) => quest.status === "COMPLETED").length,
      FAILED: quests.filter((quest) => quest.status === "FAILED").length
    }),
    [quests]
  );

  const visibleQuests = useMemo(() => {
    return quests
      .filter((quest) => {
        if (filter === "ACTIVE") {
          return quest.status === "PENDING" || quest.status === "IN_PROGRESS";
        }

        return quest.status === filter;
      })
      .sort(compareQuests);
  }, [filter, quests]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void Promise.all([loadQuests(), loadProjects()]);
  }, [accessToken]);

  async function loadQuests() {
    setLoading(true);
    setError(null);

    try {
      const questLog = await apiRequest<{ quests: Quest[] }>("/quests?limit=50");
      setQuests(questLog.quests);
    } catch (err) {
      setError(errorMessage(err, "Could not load quests"));
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const projectList = await apiRequest<{ projects: Project[] }>("/quests/projects");
      setProjects(projectList.projects);
    } catch (err) {
      setError(errorMessage(err, "Could not load projects"));
    }
  }

  async function createProject() {
    if (projectName.trim().length < 2) {
      return;
    }

    setAddingProject(true);
    setError(null);

    try {
      const createdProject = await apiRequest<{ project: Project }>("/quests/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName.trim() })
      });
      setProjects((current) => [...current, createdProject.project]);
      setProjectId(createdProject.project.id);
      setProjectName("");
    } catch (err) {
      setError(errorMessage(err, "Could not create project"));
    } finally {
      setAddingProject(false);
    }
  }

  function resetQuestForm() {
    setTitle("");
    setDescription("");
    setDifficulty("EASY");
    setCategory("General");
    setMinutes(25);
    setDueDate("");
    setParentId("");
    setPriority("MEDIUM");
    setTagText("");
    setRecurrence("NONE");
    setReminderAt("");
  }

  async function createQuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const tags = tagText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      await apiRequest<{ quest: Quest }>("/quests", {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          title,
          description: description || undefined,
          difficulty,
          category,
          estimatedMinutes: minutes,
          dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : undefined,
          projectId: projectId || undefined,
          parentQuestId: parentId || undefined,
          priority,
          tags,
          recurrence,
          reminderAt: reminderAt ? new Date(reminderAt).toISOString() : undefined
        })
      });

      resetQuestForm();
      setFilter("ACTIVE");
      setNotice("Quest added to your active queue.");
      void trackProductEvent("quest_created", { source: "quest_log", difficulty, priority });
      await Promise.all([loadQuests(), loadProjects()]);
    } catch (err) {
      setError(errorMessage(err, "Could not create quest"));
    } finally {
      setSaving(false);
    }
  }

  async function updateQuestStatus(quest: Quest, action: "start" | "complete" | "fail") {
    setActionId(quest.id);
    setError(null);
    setNotice(null);
    setAbuseSignals([]);
    setAchievementSignals([]);

    try {
      if (action === "complete") {
        const completion = await apiRequest<QuestCompletionResponse>(`/quests/${quest.id}/complete`, {
          method: "POST"
        });

        if (user?.profile) {
          setUser({
            ...user,
            profile: {
              ...user.profile,
               level: completion.profile.level,
               totalXp: completion.profile.totalXp,
               coins: completion.profile.coins,
               currentStreak: completion.profile.currentStreak,
               longestStreak: completion.profile.longestStreak
            }
          });
        }

        if (completion.abuseReports.length > 0) {
          setAbuseSignals(completion.abuseReports);
          setNotice(`Quest cleared. Earned ${completion.reward.xp} XP and ${completion.reward.coins} coins; review signals are shown below.`);
        } else {
          setNotice(`Quest cleared. Earned ${completion.reward.xp} XP and ${completion.reward.coins} coins.`);
        }

        setAchievementSignals(completion.unlockedAchievements);
        void trackProductEvent("quest_completed", {
          difficulty: quest.difficulty,
          recurring: Boolean(completion.recurringSuccessor)
        });
      } else {
        await apiRequest<{ quest: Quest }>(`/quests/${quest.id}/${action}`, {
          method: "POST"
        });
        setNotice(action === "start" ? `"${quest.title}" is now in progress.` : `"${quest.title}" was marked failed.`);
      }

      await loadQuests();
    } catch (err) {
      setError(errorMessage(err, "Quest action failed"));
    } finally {
      setActionId(null);
    }
  }

  function toggleProject(project: Project) {
    setProjectId((selectedId) => (selectedId === project.id ? "" : project.id));
  }

  if (!accessToken || !user) {
    return <RouteFallback />;
  }

  const difficultyInfo = difficultyDetails[difficulty];
  const rewardPreview = getEstimatedReward(difficulty, minutes);
  const activeMinutes = quests
    .filter((quest) => quest.status === "PENDING" || quest.status === "IN_PROGRESS")
    .reduce((total, quest) => total + quest.estimatedMinutes, 0);
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return (
    <AppShell eyebrow="Quest Board" title="Quest log">
      <section className="mb-6 overflow-hidden rounded-md border border-line bg-white shadow-panel">
        <div className="grid sm:grid-cols-3">
          <QuestSignal icon={Swords} label="Active queue" value={questCounts.ACTIVE} detail={`${activeMinutes} planned minutes`} />
          <QuestSignal icon={Trophy} label="Cleared quests" value={questCounts.COMPLETED} detail="Proof of progress" border />
          <QuestSignal icon={Flag} label="Failed quests" value={questCounts.FAILED} detail="Lessons, not lost runs" border />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <form className="h-fit rounded-md border border-line bg-white p-5 shadow-panel xl:sticky xl:top-5" onSubmit={createQuest}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-mint">
                <Plus size={16} />
                <span>Quest forge</span>
              </div>
              <h2 className="mt-1 text-xl font-bold">Shape the next objective</h2>
              <p className="mt-1 text-sm leading-6 text-ink/55">Keep the finish line concrete enough to recognize.</p>
            </div>
            <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", difficultyInfo.tone)}>
              <Target size={19} />
            </span>
          </div>

          <div className="mt-5 border-y border-line py-4">
            <div className="flex items-center gap-2 text-sm font-bold text-violet">
              <FolderKanban size={16} />
              Projects
            </div>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="New project name"
                className="lx-field h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-sm outline-none placeholder:text-ink/35 focus:border-sky focus:ring-2 focus:ring-sky/15"
                name="projectName"
                placeholder="New project"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <button
                aria-label="Create project"
                className="lx-button flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-violet bg-violet text-white"
                disabled={addingProject || projectName.trim().length < 2}
                onClick={() => void createProject()}
                title="Create project"
                type="button"
              >
                {addingProject ? <Loader2 className="animate-spin" size={17} /> : <FolderPlus size={17} />}
              </button>
            </div>
            {projects.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {projects.map((project) => (
                  <button
                    aria-pressed={projectId === project.id}
                    className={clsx(
                      "lx-button inline-flex h-8 items-center gap-2 rounded-md border",
                      projectId === project.id ? "border-ink bg-ink" : "border-line bg-white",
                      "px-2.5 text-xs font-bold",
                      projectId === project.id ? "text-white" : "text-ink/55 hover:border-mint"
                    )}
                    key={project.id}
                    onClick={() => toggleProject(project)}
                    type="button"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                    {project.name}
                    <span className="text-[10px] opacity-60">{project.activeQuestCount}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4">
            <Input
              label="Quest title"
              name="title"
              placeholder="What does done look like?"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label className="grid gap-2 text-sm font-semibold text-ink">
              <span>Description</span>
              <textarea
                className="lx-field min-h-24 resize-y rounded-md border border-line bg-white px-3 py-2 text-sm outline-none placeholder:text-ink/35 focus:border-sky focus:ring-2 focus:ring-sky/15"
                placeholder="Optional context, constraints, or success criteria"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <fieldset>
              <legend className="text-sm font-semibold">Difficulty</legend>
              <div className="mt-2 grid grid-cols-5 gap-1 rounded-md border border-line bg-paper p-1">
                {difficulties.map((questDifficulty) => (
                  <QuestChoice
                    active={difficulty === questDifficulty}
                    key={questDifficulty}
                    kind="difficulty"
                    onSelect={() => setDifficulty(questDifficulty)}
                  >
                    {formatLabel(questDifficulty)}
                  </QuestChoice>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-ink/45">{difficultyInfo.description}</p>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">Priority</legend>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-line bg-paper p-1">
                {priorities.map((questPriority) => (
                  <QuestChoice
                    active={priority === questPriority}
                    key={questPriority}
                    kind="priority"
                    onSelect={() => setPriority(questPriority)}
                  >
                    {formatLabel(questPriority)}
                  </QuestChoice>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Input label="Category" name="category" required value={category} onChange={(event) => setCategory(event.target.value)} />
              <Input
                label="Time estimate"
                min={5}
                max={480}
                name="estimatedMinutes"
                type="number"
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </div>
            <QuestSelect
              label={<span>Project</span>}
              onChange={(event) => setProjectId(event.target.value)}
              value={projectId}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </QuestSelect>
            <QuestSelect
              label={
                <span className="inline-flex items-center gap-2">
                  <GitBranch size={14} /> Parent quest
                </span>
              }
              onChange={(event) => setParentId(event.target.value)}
              value={parentId}
            >
              <option value="">Top-level quest</option>
              {quests
                .filter((quest) => !quest.parentQuestId && (quest.status === "PENDING" || quest.status === "IN_PROGRESS"))
                .map((quest) => (
                  <option key={quest.id} value={quest.id}>{quest.title}</option>
                ))}
            </QuestSelect>
            <Input
              label="Tags"
              name="tags"
              placeholder="deep-work, exam, client"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Input
                label="Deadline"
                min={new Date().toISOString().slice(0, 10)}
                name="dueDate"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <Input
                label="Reminder"
                min={localDateTimeMinimum()}
                name="reminderAt"
                type="datetime-local"
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
              />
            </div>
            <QuestSelect
              label={
                <span className="inline-flex items-center gap-2">
                  <Repeat2 size={14} /> Repeat after completion
                </span>
              }
              onChange={(event) => setRecurrence(event.target.value as QuestRecurrence)}
              value={recurrence}
            >
              {recurrenceOptions.map((repeat) => (
                <option key={repeat} value={repeat}>{formatLabel(repeat)}</option>
              ))}
            </QuestSelect>

            <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-paper p-3 text-center">
              <RewardPreview icon={Clock3} label="Time" value={`${minutes || 0}m`} />
              <RewardPreview icon={Sparkles} label="Base XP" value={String(rewardPreview.xp)} />
              <RewardPreview icon={Coins} label="Base coins" value={String(rewardPreview.coins)} />
            </div>

            <Button disabled={saving || !title.trim()} type="submit">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              {saving ? "Forging quest" : "Add to quest log"}
            </Button>
          </div>
        </form>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-violet">
                <Swords size={17} />
                <span>Mission queue</span>
              </div>
              <h2 className="mt-1 text-xl font-bold">{filter === "ACTIVE" ? "Ready for action" : `${formatLabel(filter)} history`}</h2>
              <SupportingText spaced>
                {loading ? "Syncing quest records..." : `${visibleQuests.length} quests in this view`}
              </SupportingText>
            </div>
            <Button disabled={loading} onClick={() => void loadQuests()} variant="ghost">
              <RotateCcw className={clsx(loading && "animate-spin")} size={17} />
              Refresh
            </Button>
          </div>

          <div className="mb-4 flex gap-1 overflow-x-auto rounded-md border border-line bg-white p-1 shadow-panel" role="tablist">
            {filters.map((questFilter) => (
              <button
                aria-selected={filter === questFilter}
                className={clsx(
                  "lx-button flex h-10 min-w-fit flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold",
                  filter === questFilter ? "bg-ink text-white shadow-action" : "text-ink/55 hover:bg-paper hover:text-ink"
                )}
                key={questFilter}
                onClick={() => setFilter(questFilter)}
                role="tab"
                type="button"
              >
                {formatLabel(questFilter)}
                <span
                  className={clsx(
                    "rounded-md px-1.5 py-0.5 text-[10px]",
                    filter === questFilter ? "bg-white/10 text-white" : "bg-paper text-ink/45"
                  )}
                >
                  {questCounts[questFilter]}
                </span>
              </button>
            ))}
          </div>

          {error && <FeedbackBanner icon={AlertCircle} message={error} tone="border-ember/20 bg-ember/10 text-ember" />}
          {notice && <FeedbackBanner icon={CheckCircle2} message={notice} tone="border-mint/20 bg-mint/10 text-mint" />}

          {achievementSignals.length > 0 && <AchievementNotice achievements={achievementSignals} />}

          {abuseSignals.length > 0 && <AbuseNotice signals={abuseSignals} />}

          <div className="overflow-hidden rounded-md border border-line bg-white shadow-panel">
            {loading && (
              <div className="flex min-h-[120px] items-center gap-3 p-5 text-sm font-semibold text-ink/55">
                <Loader2 className="animate-spin text-violet" size={19} />
                Syncing your quest log...
              </div>
            )}

            {!loading &&
              visibleQuests.map((quest) => (
                <QuestCard
                  actioning={actionId === quest.id}
                  key={quest.id}
                  onUpdate={updateQuestStatus}
                  project={quest.projectId ? projectById.get(quest.projectId) : null}
                  quest={quest}
                />
              ))}

            {!loading && visibleQuests.length === 0 && (
              <div className="flex min-h-[220px] flex-col items-start justify-center p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-mint/10 text-mint">
                  {filter === "ACTIVE" ? <Target size={21} /> : <Trophy size={21} />}
                </span>
                <h3 className="mt-4 font-bold">{filter === "ACTIVE" ? "The active queue is clear" : `No ${formatLabel(filter).toLowerCase()} quests yet`}</h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-ink/55">
                  {filter === "ACTIVE"
                    ? "Use the quest forge to turn one meaningful outcome into your next objective."
                    : "Quest outcomes will appear here as your run develops."}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function AchievementNotice({ achievements }: { achievements: UnlockedAchievementSignal[] }) {
  return (
    <div className="levelupx-achievement-celebration mb-4 rounded-md border border-gold/20 bg-white p-4 shadow-panel">
      <div className="flex items-start gap-3">
        <span className="levelupx-medal-pulse flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold/10 text-gold">
          <Medal size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">Achievement unlocked</h3>
          <p className="mt-1 text-sm leading-6 text-ink/55">This completion also advanced your character collection.</p>
          <div className="mt-3 grid gap-2">
            {achievements.map((achievement) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper px-3 py-3" key={achievement.id}>
                <div>
                  <p className="font-bold">{achievement.title}</p>
                  <SupportingText spaced>{achievement.description}</SupportingText>
                </div>
                <div className="flex gap-2 text-xs font-bold">
                  <AchievementReward kind="xp">+{achievement.xpBonus} XP</AchievementReward>
                  <AchievementReward kind="coins">+{achievement.coinBonus} coins</AchievementReward>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AchievementReward({
  children,
  kind
}: {
  children: ReactNode;
  kind: keyof typeof achievementRewardClasses;
}) {
  return <span className={achievementRewardClasses[kind]}>{children}</span>;
}

function AbuseNotice({ signals }: { signals: AbusePromptSignal[] }) {
  return (
    <div className="mb-4 rounded-md border border-ember/20 bg-ember/10 p-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 shrink-0 text-ember" size={20} />
        <div>
          <h3 className="font-bold text-ember">Completion review prompt</h3>
          <p className="mt-1 text-sm leading-6 text-ink/65">
            LevelUpX noticed unusual completion patterns and created transparent review signals for admins.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span className="rounded-md bg-white px-3 py-2 text-xs font-bold text-ember" key={signal.id}>
                {signal.severity}: {signal.reason}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestChoice({
  active,
  children,
  kind,
  onSelect
}: {
  active: boolean;
  children: ReactNode;
  kind: "difficulty" | "priority";
  onSelect: () => void;
}) {
  const choiceClass = kind === "difficulty"
    ? clsx(
        "lx-button min-h-9 rounded-md px-1 text-[10px] font-bold",
        active ? "bg-ink text-white shadow-action" : "text-ink/55 hover:bg-white hover:text-ink"
      )
    : clsx(
        "lx-button min-h-9 rounded-md",
        active && "bg-ink",
        "px-2 text-xs font-bold",
        active ? "text-white shadow-action" : "text-ink/55 hover:bg-white hover:text-ink"
      );

  return (
    <button aria-pressed={active} className={choiceClass} onClick={onSelect} type="button">
      {children}
    </button>
  );
}

function QuestCard({
  actioning,
  onUpdate,
  project,
  quest
}: {
  actioning: boolean;
  onUpdate: (quest: Quest, action: "start" | "complete" | "fail") => Promise<void>;
  project?: Project | null;
  quest: Quest;
}) {
  const dueState = getDueState(quest.dueDate);
  const active = quest.status === "PENDING" || quest.status === "IN_PROGRESS";

  return (
    <article className="border-b border-line p-4 last:border-b-0 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <QuestBadge tone={statusStyles[quest.status]}>
              {formatLabel(quest.status)}
            </QuestBadge>
            <QuestBadge tone={difficultyDetails[quest.difficulty].tone}>
              {formatLabel(quest.difficulty)}
            </QuestBadge>
            <QuestBadge tone={priorityStyles[quest.priority]}>
              {formatLabel(quest.priority)}
            </QuestBadge>
            {quest.parentQuestId && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky/10 px-2 py-1 text-[10px] font-bold text-sky">
                <GitBranch size={12} />
                Subtask
              </span>
            )}
            <span
              className={clsx(
                "inline-flex items-center gap-1 text-xs font-bold",
                dueState.overdue ? "text-ember" : "text-ink/45"
              )}
            >
              <CalendarDays size={13} />
              {dueState.label}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-bold">{quest.title}</h3>
          {quest.description && <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/55">{quest.description}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-ink/45">
            {project && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                {project.name}
              </span>
            )}
            <span>{quest.category}</span>
            <QuestMeta>
              <Clock3 size={13} /> {quest.estimatedMinutes} min
            </QuestMeta>
            {quest.recurrence !== "NONE" && (
              <QuestMeta tone="text-violet">
                <Repeat2 size={13} /> {formatLabel(quest.recurrence)}
              </QuestMeta>
            )}
            {quest.reminderAt && (
              <QuestMeta tone="text-sky">
                <BellRing size={13} /> {formatReminder(quest.reminderAt)}
              </QuestMeta>
            )}
            <QuestMeta tone="text-violet">
              <Sparkles size={13} /> {quest.xpReward} XP
            </QuestMeta>
            <QuestMeta tone="text-gold">
              <Coins size={13} /> {quest.coinReward} coins
            </QuestMeta>
          </div>
          {quest.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tags className="text-ink/35" size={13} />
              {quest.tags.map((tag) => (
                <span className="rounded-md bg-paper px-2 py-1 text-[10px] font-bold text-ink/50" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {active && (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {quest.status === "PENDING" ? (
              <Button disabled={actioning} onClick={() => void onUpdate(quest, "start")} variant="secondary">
                <QuestActionIcon active={actioning} idle={Play} />
                Start quest
              </Button>
            ) : (
              <>
                <Link
                  className="lx-button inline-flex h-11 items-center justify-center gap-2 rounded-md border border-violet bg-violet px-4 text-sm font-bold text-white shadow-action hover:bg-violet/90"
                  href={`/focus?questId=${quest.id}`}
                >
                  <TimerReset size={17} />
                  Focus
                </Link>
                <Button disabled={actioning} onClick={() => void onUpdate(quest, "complete")}>
                  <QuestActionIcon active={actioning} idle={CheckCircle2} />
                  Clear quest
                </Button>
                <Button disabled={actioning} onClick={() => void onUpdate(quest, "fail")} variant="ghost">
                  <Flag size={17} />
                  Mark failed
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function QuestBadge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={clsx("rounded-md px-2 py-1 text-[10px] font-bold", tone)}>{children}</span>;
}

function QuestMeta({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={clsx("inline-flex items-center gap-1", tone)}>{children}</span>;
}

function QuestActionIcon({ active, idle: Idle }: { active: boolean; idle: LucideIcon }) {
  return active ? <Loader2 className="animate-spin" size={17} /> : <Idle size={17} />;
}

function QuestSelect({
  children,
  label,
  onChange,
  value: selected
}: {
  children: ReactNode;
  label: ReactNode;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <select
        className="lx-field h-11 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/15"
        onChange={onChange}
        value={selected}
      >
        {children}
      </select>
    </label>
  );
}

function QuestSignal({
  icon: Icon,
  label,
  value: count,
  detail,
  border = false
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
  border?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex min-h-[104px] items-center gap-3 p-4",
        border && "border-t border-line sm:border-l sm:border-t-0"
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-violet/10 text-violet">
        <Icon size={19} />
      </span>
      <span>
        <span className="block text-xs font-bold text-ink/45">{label}</span>
        <span className="mt-0.5 block text-2xl font-bold">{count}</span>
        <span className="block text-xs text-ink/45">{detail}</span>
      </span>
    </div>
  );
}

function RewardPreview({ icon: Icon, label, value: amount }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <span>
      <Icon className="mx-auto text-violet" size={15} />
      <span className="mt-1 block text-[10px] font-bold text-ink/45">{label}</span>
      <span className="block text-sm font-bold">{amount}</span>
    </span>
  );
}

function FeedbackBanner({ icon: Icon, message, tone }: { icon: LucideIcon; message: string; tone: string }) {
  return (
    <div className={clsx("mb-4 flex items-start gap-3 rounded-md border px-4 py-3 text-sm font-semibold", tone)}>
      <Icon className="mt-0.5 shrink-0" size={17} />
      <span>{message}</span>
    </div>
  );
}

function compareQuests(left: Quest, right: Quest) {
  if (left.status !== right.status) {
    return left.status === "IN_PROGRESS" ? -1 : 1;
  }

  const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  return leftDue - rightDue;
}

function getDueState(dateIso: string | null) {
  if (!dateIso) {
    return { label: "No deadline", overdue: false };
  }

  const due = new Date(dateIso);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);

  if (days < 0) {
    return { label: `${Math.abs(days)}d overdue`, overdue: true };
  }

  if (days === 0) {
    return { label: "Due today", overdue: false };
  }

  if (days === 1) {
    return { label: "Due tomorrow", overdue: false };
  }

  return {
    label: shortDate.format(due),
    overdue: false
  };
}

function getEstimatedReward(difficulty: QuestDifficulty, minutes: number) {
  // Keep the preview aligned with the backend's quest reward formula.
  const safe = Number.isFinite(minutes) ? minutes : 0;
  const xp = Math.max(10, Math.round(safe * 2));
  const coins = Math.max(2, Math.round(safe / 10));
  return {
    xp: Math.round(xp * rewardWeights[difficulty]),
    coins: Math.round(coins * rewardWeights[difficulty])
  };
}

function formatReminder(dateIso: string) {
  return reminderDate.format(new Date(dateIso));
}

function localDateTimeMinimum() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatLabel(label: string) {
  return label
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
