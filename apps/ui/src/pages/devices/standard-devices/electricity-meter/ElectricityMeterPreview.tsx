import { Zap } from "lucide-react";
import {
  isElectricityMeter,
  readElectricityMeterAttributes,
} from "@/api/devices";
import type { StandardPreviewProps } from "../types";

function fmt(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(decimals);
}

export function ElectricityMeterPreview({ device }: StandardPreviewProps) {
  if (!isElectricityMeter(device)) return null;
  const a = readElectricityMeterAttributes(device);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Zap className="h-5 w-5 text-muted-foreground" />
        <span className="font-mono text-2xl font-light tabular-nums leading-none">
          {fmt(a.activePower, 0)}
          <span className="ml-1 text-xs text-muted-foreground">W</span>
        </span>
      </div>

      <div className="text-xs text-muted-foreground tabular-nums">
        {fmt(a.energy)}
        <span className="ml-1">kWh</span>
      </div>
    </div>
  );
}
