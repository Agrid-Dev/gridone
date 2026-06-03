import { DeviceType } from "@/api/devices";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
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

/** Resolves a renderer shared across all given device types using object identity. */
function resolveSharedRenderer(
  deviceTypes: DeviceType[],
  attributeName: string,
  value: string,
): ValueRenderer | undefined {
  if (deviceTypes.length === 0) return undefined;
  const renderers = deviceTypes.map((t) =>
    lookupValueRenderer(t, attributeName, value),
  );
  const first = renderers[0];
  if (first && renderers.every((r) => r === first)) return first;
  return undefined;
}

type AttributeValueBadgeProps = {
  /** A single device type for the common case, or several when the value is
   *  shared across a mixed selection — an icon shows only when all of them
   *  agree on the same renderer. */
  deviceType?: DeviceType | DeviceType[];
  attributeName: string;
  value: string | number | boolean;
  className?: string;
};

/** Renders a discrete attribute value with an icon and colour when the device
 *  type(s) share the same standard renderer; falls back to a plain text label
 *  otherwise. */
export function AttributeValueBadge({
  deviceType,
  attributeName,
  value,
  className,
}: AttributeValueBadgeProps) {
  const label = String(value);
  const deviceTypes =
    deviceType === undefined
      ? []
      : Array.isArray(deviceType)
        ? deviceType
        : [deviceType];
  const renderer =
    deviceTypes.length > 0
      ? resolveSharedRenderer(deviceTypes, attributeName, label)
      : undefined;

  if (!renderer) {
    return <span className={className}>{label}</span>;
  }

  const { Icon, color, rotate } = renderer;
  return (
    <span
      className={cn("inline-flex items-center gap-[0.4em]", color, className)}
    >
      <Icon
        className={cn("size-[1.15em] shrink-0", rotate && "rotate-90")}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
