import { Fan } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { isAhuDoubleFlux, readAhuDoubleFluxAttributes } from "@/api/devices";
import { lookupSemanticColor, SEMANTIC_TEXT_CLASS } from "@/lib/semanticColors";
import type { StandardPreviewProps } from "../types";

function fmt(v: number | null, digits = 1): string {
  if (v == null) return "—";
  return Number(v).toFixed(digits);
}

export function AhuDoubleFluxPreview({ device }: StandardPreviewProps) {
  const { t } = useTranslation("standardDevices");
  if (!isAhuDoubleFlux(device)) return null;
  const a = readAhuDoubleFluxAttributes(device);

  // Fan tinted by HVAC mode (heat/cool/...); grey when the device has none.
  const modeColor =
    a.hvacMode != null
      ? lookupSemanticColor("mode", String(a.hvacMode))
      : undefined;
  const fanClass = modeColor
    ? SEMANTIC_TEXT_CLASS[modeColor]
    : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Supply air temperature */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs text-muted-foreground truncate">
          {t("ahu_double_flux.synoptic.supplyAir")}:
        </span>
        <span className="font-mono text-2xl font-light tabular-nums leading-none">
          {fmt(a.supplyAirTemperature)}°
        </span>
      </div>

      {/* Supply fan */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Fan className={cn("h-3 w-3", fanClass)} />
        <span className="tabular-nums">{fmt(a.supplyFanSpeed, 0)} %</span>
      </div>
    </div>
  );
}
