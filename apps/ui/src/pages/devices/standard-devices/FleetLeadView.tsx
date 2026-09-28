import { cn } from "@/lib/utils";
import type { FleetLead, FleetLeadLine } from "./types";

const LINE_CLASS = {
  primary: { row: "h-7", value: "text-lg font-semibold text-card-foreground" },
  secondary: { row: "h-5", value: "text-sm font-medium text-foreground/70" },
} as const;

/** One lead line: the value in the display face, its muted label right after
 *  it. */
function Line({
  line,
  rank,
}: {
  line: FleetLeadLine | null | undefined;
  rank: keyof typeof LINE_CLASS;
}) {
  if (!line) return null;
  const { row, value } = LINE_CLASS[rank];
  return (
    <p className={cn("flex min-w-0 items-baseline gap-1.5", row)}>
      <span
        className={cn(
          "truncate whitespace-nowrap font-display tabular-nums",
          value,
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
 * The fleet card lead, one typography for every type: a primary line (value
 * text-lg) over a secondary one (value text-sm), both in the display face so
 * the two numbers read as a pair, each followed by its muted text-xs label.
 * An absent line renders nothing, so a lone line centres on the glyph (the
 * card's lead row); the glyph's fixed height keeps cards in a row aligned.
 */
export function FleetLeadView({ lead }: { lead: FleetLead }) {
  return (
    <div className="min-w-0">
      <Line line={lead.primary} rank="primary" />
      <Line line={lead.secondary} rank="secondary" />
    </div>
  );
}
