import { Info, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Severity } from "@/lib/severity";
import { cn } from "@/lib/utils";

const ICON: Record<Severity, LucideIcon> = {
  alert: TriangleAlert,
  warning: TriangleAlert,
  info: Info,
};

/** Icon tile tint per severity, matching `SeverityLabel`'s neutral `info`.
 *  Literal classes so Tailwind keeps them in the build. */
const TILE_CLASS: Record<Severity, string> = {
  alert: "bg-status-error/10 text-status-error",
  warning: "bg-status-warning/10 text-status-warning",
  info: "bg-muted text-muted-foreground",
};

type SeveritySummaryCardProps = {
  severity: Severity;
  count: number;
  label: string;
};

/** One of the three counters above the faults table: how many faults sit at
 *  this severity, and what the operator is meant to do about them. */
export function SeveritySummaryCard({
  severity,
  count,
  label,
}: SeveritySummaryCardProps) {
  const Icon = ICON[severity];

  return (
    <Card
      data-slot="severity-summary"
      data-severity={severity}
      className="flex items-center gap-4 p-5"
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          TILE_CLASS[severity],
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold leading-none tabular-nums">
          {count}
        </p>
        <p className="mt-1.5 truncate text-sm text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
