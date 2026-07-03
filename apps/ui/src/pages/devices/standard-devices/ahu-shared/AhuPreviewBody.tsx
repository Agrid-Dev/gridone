import { Fan } from "lucide-react";
import { cn } from "@/lib/utils";
import { lookupSemanticColor, SEMANTIC_TEXT_CLASS } from "@/lib/semanticColors";
import { fmt } from "./format";
import { useAhuSynopticLabel } from "./labels";

type AhuPreviewBodyProps = {
  supplyAirTemperature: number | null;
  supplyFanSpeed: number | null;
  hvacMode: string | null;
};

/** Compact card preview shared by the AHU types: supply air temperature
 *  plus the supply fan speed. */
export function AhuPreviewBody({
  supplyAirTemperature,
  supplyFanSpeed,
  hvacMode,
}: AhuPreviewBodyProps) {
  const label = useAhuSynopticLabel();

  // Fan tinted by HVAC mode (heat/cool/...); grey when the device has none.
  const modeColor =
    hvacMode != null
      ? lookupSemanticColor("mode", String(hvacMode))
      : undefined;
  const fanClass = modeColor
    ? SEMANTIC_TEXT_CLASS[modeColor]
    : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Supply air temperature */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs text-muted-foreground truncate">
          {label("supplyAir")}:
        </span>
        <span className="font-mono text-2xl font-light tabular-nums leading-none">
          {fmt(supplyAirTemperature, 1)}°
        </span>
      </div>

      {/* Supply fan */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Fan className={cn("h-3 w-3", fanClass)} />
        <span className="tabular-nums">{fmt(supplyFanSpeed, 0)} %</span>
      </div>
    </div>
  );
}
