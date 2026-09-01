import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { SupportingText } from "./PagePrimitives";

export function StatCard({ icon: Icon, iconClass, label, metric }: { icon: LucideIcon; iconClass: string; label: string; metric: ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-panel">
      <Icon className={clsx("mb-4", iconClass)} size={21} />
      <SupportingText>{label}</SupportingText>
      <h2 className="mt-1 text-3xl font-bold">{metric}</h2>
    </div>
  );
}
