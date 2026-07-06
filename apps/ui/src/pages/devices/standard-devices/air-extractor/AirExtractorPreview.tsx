import { Fan } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAirExtractor, readAirExtractorAttributes } from "@/api/devices";
import { fmt } from "../synoptic";
import { FAN_STATUS_DOT_CLASS, fanIsSpinning, fanStatus } from "./fan";
import { useAirExtractorLabel } from "./labels";
import type { StandardPreviewProps } from "../types";

export function AirExtractorPreview({ device }: StandardPreviewProps) {
  const label = useAirExtractorLabel();
  if (!isAirExtractor(device)) return null;
  const a = readAirExtractorAttributes(device);
  const status = fanStatus(a);
  const spinning = fanIsSpinning(a);

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Running status */}
      <div className="flex items-center gap-1.5 min-w-0">
        {status && (
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              FAN_STATUS_DOT_CLASS[status.tone],
            )}
          />
        )}
        <span className="truncate text-xs text-muted-foreground">
          {status ? label(status.key) : "—"}
        </span>
      </div>

      {/* Fan speed */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Fan
          className={cn(
            "h-3 w-3",
            spinning ? "text-hvac-fan" : "text-muted-foreground",
          )}
        />
        <span className="tabular-nums">{fmt(a.fanSpeed, 0)} %</span>
      </div>
    </div>
  );
}
