import { Fan, ArrowRight } from "lucide-react";
import { isAwhp, readAwhpAttributes } from "@/api/devices";
import type { StandardPreviewProps } from "../types";

function formatTemp(value: number | null): string {
  return value != null ? `${Number(value).toFixed(1)}°` : "—";
}

/**
 * Returns pipe color classes based on which side is warmer.
 * The warmer pipe is red, the cooler is blue. Equal or missing → both grey.
 */
function pipeColors(
  inlet: number | null,
  outlet: number | null,
): { inlet: string; outlet: string } {
  if (inlet == null || outlet == null || inlet === outlet) {
    return { inlet: "text-muted-foreground", outlet: "text-muted-foreground" };
  }
  return inlet > outlet
    ? { inlet: "text-red-500", outlet: "text-blue-500" }
    : { inlet: "text-blue-500", outlet: "text-red-500" };
}

export function AwhpPreview({ device }: StandardPreviewProps) {
  if (!isAwhp(device)) return null;
  const attrs = readAwhpAttributes(device);

  const colors = pipeColors(attrs.inletTemperature, attrs.outletTemperature);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Pipes + heat pump box */}
      <div className="flex items-center gap-1">
        {/* Inlet pipe */}
        <div className={`flex items-center gap-0.5 ${colors.inlet}`}>
          <span className="text-xs font-medium tabular-nums">
            {formatTemp(attrs.inletTemperature)}
          </span>
          <ArrowRight className="h-3 w-3" />
        </div>

        {/* Heat pump box */}
        <div className="flex h-8 flex-1 items-center justify-center rounded bg-muted">
          <Fan className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Outlet pipe */}
        <div className={`flex items-center gap-0.5 ${colors.outlet}`}>
          <ArrowRight className="h-3 w-3" />
          <span className="text-xs font-medium tabular-nums">
            {formatTemp(attrs.outletTemperature)}
          </span>
        </div>
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="uppercase">{attrs.unitRunStatus ?? "—"}</span>
        {attrs.mode && (
          <span className="truncate max-w-[5rem] uppercase">{attrs.mode}</span>
        )}
      </div>
    </div>
  );
}
