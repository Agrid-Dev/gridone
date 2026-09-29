import { cn } from "@/lib/utils";
import type { FleetLead, FleetLeadLine } from "./types";

const VALUE_CLASS = {
  primary: "text-2xl font-medium tracking-[-0.01em] text-card-foreground",
  secondary: "text-sm font-medium text-foreground/70",
} as const;

/** One lead line: the value in the display face, its muted label right after
 *  it. A muted line greys its value unless the line carries its own tone. */
function Line({
  line,
  rank,
  muted = false,
}: {
  line: FleetLeadLine | null | undefined;
  rank: keyof typeof VALUE_CLASS;
  muted?: boolean;
}) {
  if (!line) return null;
  return (
    <p className="flex min-w-0 items-baseline gap-1.5">
      <span
        className={cn(
          "truncate whitespace-nowrap font-display tabular-nums",
          VALUE_CLASS[rank],
          muted && "text-muted-foreground",
          line.tone,
        )}
      >
        {line.value}
      </span>
      {line.label && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {line.label}
        </span>
      )}
    </p>
  );
}

/**
 * The fleet card lead, one typography for every type: a primary value
 * (text-2xl) and a secondary one (text-sm) on one baseline, both in the
 * display face so the two numbers read as a pair, each followed by its muted
 * text-xs label; the secondary wraps under the primary when the card is too
 * narrow. `muted` greys the primary value — the reading of a unit standing
 * idle, whose setpoint is not being pursued.
 */
export function FleetLeadView({
  lead,
  muted = false,
}: {
  lead: FleetLead;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-[18px] gap-y-1">
      <Line line={lead.primary} rank="primary" muted={muted} />
      <Line line={lead.secondary} rank="secondary" />
    </div>
  );
}
