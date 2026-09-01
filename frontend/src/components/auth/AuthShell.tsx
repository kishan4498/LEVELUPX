import { clsx } from "clsx";
import { CheckCircle2, Clock, ShieldCheck, Sparkles, Swords, Trophy, Zap } from "lucide-react";
import type { ReactNode } from "react";

const steps = [
  { label: "Plan a quest", detail: "Turn work into a clear objective.", icon: Swords, tone: "text-mint bg-mint/10" },
  { label: "Enter focus", detail: "Build momentum in timed sessions.", icon: Clock, tone: "text-sky bg-sky/10" },
  { label: "Claim progress", detail: "Earn XP, coins, skills, and rank.", icon: Trophy, tone: "text-gold bg-gold/10" }
];

function JourneyStep({ step }: { step: (typeof steps)[number] }) {
  const Icon = step.icon;

  return (
    <div className="border-t border-white/10 pt-4">
      <span className={clsx("flex h-9 w-9 items-center justify-center rounded-md", step.tone)}>
        <Icon size={17} />
      </span>
      <p className="mt-3 text-sm font-bold">{step.label}</p>
      <p className="mt-1 text-xs leading-5 text-white/60">{step.detail}</p>
    </div>
  );
}

export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[minmax(0,1fr)_500px]">
      <section className="order-2 flex min-h-[42vh] flex-col justify-between border-t border-ink bg-ink p-6 text-white shadow-command sm:p-8 lg:order-1 lg:min-h-screen lg:border-b-0 lg:border-r lg:border-t-0 lg:p-12">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-mint text-white shadow-action">
            <Zap size={20} />
          </span>
          <span>
            <span className="block text-lg font-bold">LevelUpX</span>
            <span className="block text-xs font-semibold text-white/60">Quest command system</span>
          </span>
        </div>

        <div className="my-10 max-w-2xl lg:my-16">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-mint">
            <Sparkles size={16} />
            <span>RPG productivity</span>
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Build momentum. Earn proof.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/60">
            Turn meaningful work into quests, focus sessions, character progression, and shared victories.
          </p>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {steps.map((step) => <JourneyStep key={step.label} step={step} />)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-5 text-xs font-semibold text-white/60">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="text-mint" size={15} />
            Progress that stays visible
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="text-sky" size={15} />
            Protected account access
          </span>
        </div>
      </section>

      <section className="order-1 flex items-center justify-center px-5 py-8 sm:px-8 sm:py-10 lg:order-2">
        <div className="lx-page-enter w-full max-w-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-violet">Secure checkpoint</p>
              <p className="mt-1 text-sm text-ink/65">Continue your current run</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white text-violet shadow-panel">
              <ShieldCheck size={19} />
            </span>
          </div>

          <div className="lx-panel rounded-md p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink/65">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
