import { Power } from "lucide-react";
import { isThermostat, readThermostatAttributes } from "@/api/devices";
import type { StandardPreviewProps } from "../registry";

export function ThermostatPreview({ device }: StandardPreviewProps) {
  if (!isThermostat(device)) return null;
  const attrs = readThermostatAttributes(device);
  const isOn = attrs.onoffState === true;

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Temperatures */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-mono text-2xl font-light tabular-nums leading-none">
          {attrs.temperature != null
            ? Number(attrs.temperature).toFixed(1)
            : "—"}
          °
        </span>
        <span className="text-xs text-muted-foreground">
          →{" "}
          <span className="font-medium text-foreground">
            {attrs.temperatureSetpoint != null
              ? `${Number(attrs.temperatureSetpoint).toFixed(1)}°`
              : "—"}
          </span>
        </span>
      </div>

      {/* Mode + on/off */}
      <div className="flex flex-col items-end gap-0.5 text-[10px] text-muted-foreground">
        <span
          className={`flex items-center gap-0.5 ${isOn ? "font-bold text-green-600" : "text-muted-foreground"}`}
        >
          <Power className="h-2.5 w-2.5" />
          {isOn ? "ON" : "OFF"}
        </span>
        {attrs.mode && (
          <span className="truncate max-w-[5rem] uppercase">{attrs.mode}</span>
        )}
      </div>
    </div>
  );
}
