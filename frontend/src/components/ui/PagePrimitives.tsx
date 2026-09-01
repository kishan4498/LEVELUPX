import { clsx } from "clsx";
import type { ReactNode } from "react";

type ChildrenProps = {
  children: ReactNode;
};

export function RouteFallback() {
  return <main className="min-h-screen bg-paper" />;
}

export function PageSection({ children, flush = false }: ChildrenProps & { flush?: boolean }) {
  return <section className={clsx(!flush && "mt-6", "rounded-lg bg-white p-6 shadow-panel")}>{children}</section>;
}

export function PagePanel({ children }: ChildrenProps) {
  return <div className="rounded-lg bg-white p-6 shadow-panel">{children}</div>;
}

export function SectionHeading({ children }: ChildrenProps) {
  return <h2 className="text-lg font-bold">{children}</h2>;
}

export function PanelHeader({ children }: ChildrenProps) {
  return <div className="flex flex-wrap items-end justify-between gap-3">{children}</div>;
}

export function PanelTop({ children }: ChildrenProps) {
  return <div className="flex flex-wrap items-start justify-between gap-4">{children}</div>;
}

export function MetaLabel({ children }: ChildrenProps) {
  return <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/40">{children}</p>;
}

export function SupportingText({ children, spaced = false }: ChildrenProps & { spaced?: boolean }) {
  return <p className={clsx(spaced && "mt-1", "text-sm text-ink/55")}>{children}</p>;
}

export function PanelTag({ children }: ChildrenProps) {
  return <span className="rounded-md bg-paper px-3 py-2 text-sm font-semibold text-ink/60">{children}</span>;
}

export function EmptyPanelMessage({ children, wide = false }: ChildrenProps & { wide?: boolean }) {
  return <p className={clsx("rounded-md bg-paper px-3 py-2 text-sm text-ink/55", wide && "lg:col-span-3")}>{children}</p>;
}

export function TableMessage({ children }: ChildrenProps) {
  return <p className="px-4 py-4 text-sm text-ink/55">{children}</p>;
}
