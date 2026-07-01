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
import { DeviceType } from "@/api/devices";
import type { Severity } from "@/api/severity";
import { formatValue, type CellValue } from "@/lib/formatValue";
import {
  lookupSemanticColor,
  SEMANTIC_TEXT_CLASS,
  SEVERITY_LEVEL,
} from "@/lib/semanticColors";
import { cn } from "@/lib/utils";

type ValueRenderer = { Icon: LucideIcon; color: string; rotate?: boolean };

/** HVAC mode icons; the colour comes from the shared semantic registry so a
 *  mode is tinted the same here and in its history chart panel. */
const HVAC_MODE_ICONS: Record<string, LucideIcon> = {
  heat: Sun,
  cool: Snowflake,
  fan: Fan,
  auto: RefreshCcwDot,
};

const HVAC_MODE_RENDERERS: Record<string, ValueRenderer> = Object.fromEntries(
  Object.entries(HVAC_MODE_ICONS).map(([value, Icon]) => {
    const color = lookupSemanticColor("mode", value);
    return [
      value,
      { Icon, color: color ? SEMANTIC_TEXT_CLASS[color] : "text-foreground" },
    ];
  }),
);

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

type AttributeValueProps = {
  value: CellValue;
  attributeName: string;
  /** A single device type for the common case, or several when the value is
   *  shared across a mixed selection — an icon shows only when all of them
   *  agree on the same renderer. */
  deviceType?: DeviceType | DeviceType[];
  /** Data type used by the fallback formatter (e.g. floats to 2 decimals). */
  dataType?: string;
  /** When set, colours the value by severity (green when not faulty). */
  fault?: { severity: Severity; isFaulty: boolean };
  className?: string;
};

/**
 * The single renderer for a device attribute value:
 *  - fault attributes are coloured by severity (green when not faulty);
 *  - standard enum values (e.g. thermostat `mode`) show their icon + label,
 *    including across a mixed device-type selection;
 *  - everything else falls back to {@link formatValue} by data type
 *    (floats to 2 decimals, booleans, the null em dash…).
 */
export function AttributeValue({
  value,
  attributeName,
  deviceType,
  dataType,
  fault,
  className,
}: AttributeValueProps) {
  if (fault) {
    const level = fault.isFaulty ? SEVERITY_LEVEL[fault.severity] : "ok";
    return (
      <span
        className={cn("font-medium", SEMANTIC_TEXT_CLASS[level], className)}
      >
        {formatValue(value, dataType)}
      </span>
    );
  }

  const deviceTypes =
    deviceType === undefined
      ? []
      : Array.isArray(deviceType)
        ? deviceType
        : [deviceType];
  const renderer =
    value == null
      ? undefined
      : resolveSharedRenderer(deviceTypes, attributeName, String(value));

  if (renderer) {
    const { Icon, color, rotate } = renderer;
    return (
      <span
        className={cn("inline-flex items-center gap-[0.4em]", color, className)}
      >
        <Icon
          className={cn("size-[1.15em] shrink-0", rotate && "rotate-90")}
          aria-hidden
        />
        <span>{String(value)}</span>
      </span>
    );
  }

  return <span className={className}>{formatValue(value, dataType)}</span>;
}
