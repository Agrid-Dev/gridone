import {
  ArrowUpNarrowWide,
  Fan,
  RefreshCcwDot,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Snowflake,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DeviceType } from "@/api/devices";
import { cn } from "@/lib/utils";

type ValueRenderer = { Icon: LucideIcon; color: string; rotate?: boolean };

const HVAC_MODE_RENDERERS: Record<string, ValueRenderer> = {
  heat: { Icon: Sun, color: "text-orange-500" },
  cool: { Icon: Snowflake, color: "text-blue-500" },
  fan: { Icon: Fan, color: "text-green-500" },
  auto: { Icon: RefreshCcwDot, color: "text-amber-500" },
};

const HVAC_FAN_SPEED_RENDERERS: Record<string, ValueRenderer> = {
  low: { Icon: SignalLow, color: "text-muted-foreground" },
  medium: { Icon: SignalMedium, color: "text-muted-foreground" },
  high: { Icon: SignalHigh, color: "text-muted-foreground" },
  auto: {
    Icon: ArrowUpNarrowWide,
    color: "text-muted-foreground",
    rotate: true,
  },
};

const STANDARD_VALUE_RENDERERS: Partial<
  Record<DeviceType, Record<string, Record<string, ValueRenderer>>>
> = {
  [DeviceType.Thermostat]: {
    mode: HVAC_MODE_RENDERERS,
    fan_speed: HVAC_FAN_SPEED_RENDERERS,
  },
  [DeviceType.Awhp]: {
    mode: HVAC_MODE_RENDERERS,
    fan_speed: HVAC_FAN_SPEED_RENDERERS,
  },
};

/** Returns undefined when deviceType is absent or the triple has no known renderer. */
export function lookupValueRenderer(
  deviceType: DeviceType | undefined,
  attributeName: string,
  value: string,
): ValueRenderer | undefined {
  if (!deviceType) return undefined;
  return STANDARD_VALUE_RENDERERS[deviceType]?.[attributeName]?.[value];
}

type AttributeValueBadgeProps = {
  deviceType?: DeviceType;
  attributeName: string;
  value: string | number | boolean;
  className?: string;
};

/** Renders a discrete attribute value with an icon and colour when a standard
 *  renderer exists for the device type; falls back to a plain text label. */
export function AttributeValueBadge({
  deviceType,
  attributeName,
  value,
  className,
}: AttributeValueBadgeProps) {
  const label = String(value);
  const renderer = lookupValueRenderer(deviceType, attributeName, label);

  if (!renderer) {
    return <span className={className}>{label}</span>;
  }

  const { Icon, color, rotate } = renderer;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon
        className={cn("h-4 w-4 shrink-0", color, rotate && "rotate-90")}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
