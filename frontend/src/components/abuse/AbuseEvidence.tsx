import { MetaLabel } from "@/components/ui/PagePrimitives";

type AbuseEvidenceProps = {
  metadata: unknown;
};

function hasEvidence(metadata: unknown): metadata is Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return Object.keys(metadata).length > 0;
}

function fieldLabel(field: string) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(fieldValue: unknown) {
  if (fieldValue === null || fieldValue === undefined) {
    return "Not provided";
  }

  if (typeof fieldValue === "string" || typeof fieldValue === "number" || typeof fieldValue === "boolean") {
    return String(fieldValue);
  }

  return JSON.stringify(fieldValue);
}

function evidenceOrigin(metadata: Record<string, unknown>) {
  if ("completionsLastHour" in metadata || "repeatedTitleCompletionsToday" in metadata) {
    return "Automated completion-rule signal";
  }

  if ("context" in metadata) {
    return "Member-submitted evidence";
  }

  return "Attached evidence";
}

export function AbuseEvidence({ metadata }: AbuseEvidenceProps) {
  if (!hasEvidence(metadata)) {
    return (
      <div className="mt-4 rounded-md bg-paper px-3 py-2 text-sm text-ink/55">
        No evidence metadata attached.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-md bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MetaLabel>Evidence metadata</MetaLabel>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-violet">
          {evidenceOrigin(metadata)}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {Object.entries(metadata).map(([field, fieldValue]) => (
          <div className="grid gap-1 rounded-md bg-white px-3 py-2 sm:grid-cols-[150px_1fr]" key={field}>
            <span className="text-sm font-semibold text-ink/60">{fieldLabel(field)}</span>
            <span className="break-words text-sm leading-5 text-ink/65">{formatValue(fieldValue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
