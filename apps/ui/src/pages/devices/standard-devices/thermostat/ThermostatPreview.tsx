import {
  DeviceType,
  isThermostat,
  readThermostatAttributes,
} from "@/api/devices";
import {
  AttributeValueBadge,
  lookupValueRenderer,
} from "@/components/AttributeValueBadge";
import { cn } from "@/lib/utils";
import type { StandardPreviewProps } from "../registry";

export function ThermostatPreview({ device }: StandardPreviewProps) {
  if (!isThermostat(device)) return null;
  const attrs = readThermostatAttributes(device);
  const isOn = attrs.onoffState === true;

  const onColor =
    lookupValueRenderer(DeviceType.Thermostat, "mode", attrs.mode as string)
      ?.color ?? "text-primary";

  return (
    <div className="flex items-end justify-between gap-3">
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
          <span
            className={cn(
              "font-medium transition-colors",
              isOn ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {attrs.temperatureSetpoint != null
              ? `${Number(attrs.temperatureSetpoint).toFixed(1)}°`
              : "—"}
          </span>
        </span>
      </div>

      {/* Mode + on/off */}
      <div className="flex items-end gap-1 text-[10px] text-muted-foreground">
        {attrs.mode && (
          <AttributeValueBadge
            deviceType={DeviceType.Thermostat}
            attributeName="mode"
            value={attrs.mode}
            className={cn(
              "max-w-[5rem] truncate uppercase transition-colors",
              // Off: mode is set but inert — grey it. On: keeps its hue.
              !isOn && "text-muted-foreground",
            )}
          />
        )}
        {/* Neutral divider — structure, not signal, so it never takes the hue. */}
        <span aria-hidden className="h-3 w-px self-center bg-border" />
        <span
          className={cn(
            "transition-colors",
            isOn ? cn("font-bold", onColor) : "text-muted-foreground",
          )}
        >
          {isOn ? "ON" : "OFF"}
        </span>
      </div>
    </div>
  );
}
