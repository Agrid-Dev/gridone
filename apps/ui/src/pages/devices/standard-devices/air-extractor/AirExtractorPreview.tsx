import { Fan } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAirExtractor, readAirExtractorAttributes } from "@/api/devices";
import { fmt } from "../synoptic";
import { useAirExtractorLabel } from "./labels";
import type { StandardPreviewProps } from "../types";

export function AirExtractorPreview({ device }: StandardPreviewProps) {
  const label = useAirExtractorLabel();
  if (!isAirExtractor(device)) return null;
  const a = readAirExtractorAttributes(device);
  const running = a.onoffState;

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Running status */}
      <div className="flex items-center gap-1.5 min-w-0">
        {running != null && (
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              running ? "bg-status-ok" : "bg-muted-foreground",
            )}
          />
        )}
        <span className="truncate text-xs text-muted-foreground">
          {running == null ? "—" : running ? label("on") : label("off")}
        </span>
      </div>

      {/* Fan speed */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Fan
          className={cn(
            "h-3 w-3",
            running ? "text-hvac-fan" : "text-muted-foreground",
          )}
        />
        <span className="tabular-nums">{fmt(a.fanSpeed, 0)} %</span>
      </div>
    </div>
  );
}
