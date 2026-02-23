import { LegendSwatch } from "./LegendSwatch";
import type { TooltipRow } from "./types";

export function TooltipContent({
  timestamp,
  rows,
}: {
  timestamp: Date;
  rows: TooltipRow[];
}) {
  return (
    <div className="leading-relaxed">
      <div className="mb-1 text-xs font-normal">
        {timestamp.toLocaleString()}
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center gap-1.5 rounded px-1 -mx-1 text-xs font-normal"
          style={
            r.active && r.swatch
              ? { backgroundColor: r.swatch.color.replace(/\)$/, " / 0.1)") }
              : undefined
          }
        >
          {r.swatch && (
            <LegendSwatch color={r.swatch.color} variant={r.swatch.variant} />
          )}
          <span className={r.active ? undefined : "text-muted-foreground"}>
            {r.label}{" "}
          </span>
          <span className="font-semibold">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
