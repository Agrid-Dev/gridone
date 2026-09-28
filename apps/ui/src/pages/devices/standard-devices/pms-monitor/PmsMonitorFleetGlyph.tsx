import { BedDouble, CalendarClock } from "lucide-react";
import { isPmsMonitor, readPmsMonitorAttributes } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { CornerBadge, DASH, GlyphFrame, useGlyphLabel } from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";

/** PMS monitor: the room's bed on a tile. Occupied is the only coloured state
 *  (tile filled); a booking is an indicator, not a tint — the calendar badge
 *  on an otherwise free-looking tile. */
export function PmsMonitorFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const status = isPmsMonitor(device)
    ? readPmsMonitorAttributes(device).reservationStatus
    : null;
  const occupied = status === "checked_in";
  const tone = occupied ? "text-primary" : "text-muted-foreground";

  return (
    <GlyphFrame label={label} state={status ?? "unknown"}>
      <rect
        x={3}
        y={3}
        width={38}
        height={38}
        rx={10}
        strokeWidth={1.5}
        stroke="currentColor"
        strokeDasharray={status ? undefined : DASH}
        className={cn(tone, occupied ? "fill-primary/15" : "fill-none")}
      />
      <BedDouble
        x={9}
        y={9}
        width={26}
        height={26}
        strokeWidth={1.75}
        className={tone}
      />
      {status === "booked" && (
        <CornerBadge icon={CalendarClock} tone="text-foreground" />
      )}
    </GlyphFrame>
  );
}
