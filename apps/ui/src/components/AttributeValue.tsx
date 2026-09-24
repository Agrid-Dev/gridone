import type { LucideIcon } from "lucide-react";
import {
  ArrowUpNarrowWide,
  Droplets,
  Fan,
  Moon,
  RefreshCcwDot,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Snowflake,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AttributeWriteState,
  WriteReason,
  ValueLabel,
} from "@gridone/sdk";
import { DeviceType } from "@/lib/devices";
import type { Severity } from "@/lib/severity";
import { attributeValueLabel } from "@/lib/attributeValueLabel";
import { formatValue, type CellValue } from "@/lib/formatValue";
import {
  faultLevel,
  lookupSemanticColor,
  SEMANTIC_BG_CLASS,
  SEMANTIC_TEXT_CLASS,
  type StatusLevel,
} from "@/lib/semanticColors";
import { cn } from "@/lib/utils";
import { useValueLabel } from "@/hooks/useValueLabel";

type ValueRenderer = { Icon: LucideIcon; color: string; rotate?: boolean };

/** HVAC mode icons; the colour comes from the shared semantic registry so a
 *  mode is tinted the same here and in its history chart panel. */
const HVAC_MODE_ICONS: Record<string, LucideIcon> = {
  heat: Sun,
  cool: Snowflake,
  fan: Fan,
  dry: Droplets,
  auto: RefreshCcwDot,
  idle: Moon,
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
  [DeviceType.AhuDoubleFlux]: {
    hvac_mode: HVAC_MODE_RENDERERS,
  },
  [DeviceType.AhuSingleFlux]: {
    hvac_mode: HVAC_MODE_RENDERERS,
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

/** LED-style dot for a boolean state. Faults carry a status tone; a standard
 *  boolean carries the accent, filled when true and hollow when false, since
 *  the driver never says which state is good. Sized and nudged in `em` so it
 *  stays centred on the label's x-height at any text size. Decorative: the
 *  text next to it always carries the state. */
function BooleanIndicator({
  tone,
  filled,
}: {
  tone: StatusLevel | "neutral";
  filled: boolean;
}) {
  return (
    <span
      aria-hidden
      data-tone={tone}
      className={cn(
        "relative top-[0.1em] size-[0.55em] shrink-0 rounded-full",
        tone !== "neutral"
          ? SEMANTIC_BG_CLASS[tone]
          : filled
            ? "bg-primary"
            : "border border-muted-foreground",
      )}
    />
  );
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
  /** Unit symbol appended to a plain numeric value (never to icons or faults). */
  unit?: string | null;
  /** The driver's wording of a boolean's two states, when it declares one. */
  valueLabels?: ValueLabel[] | null;
  className?: string;
  resolutionError?: WriteReason | null;
  support?: AttributeWriteState["support"];
};

/**
 * The single renderer for a device attribute value:
 *  - booleans show an indicator dot and their driver-declared label (or the
 *    localized True / False): fault-toned by `is_faulty`, neutral otherwise;
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
  unit,
  valueLabels,
  className,
  resolutionError,
  support,
}: AttributeValueProps) {
  const { t } = useTranslation();
  const { t: td } = useTranslation("devices");
  const labelFor = useValueLabel();
  const level = fault ? faultLevel(fault) : undefined;
  const faultClass = level && cn("font-medium", SEMANTIC_TEXT_CLASS[level]);

  if (
    support === "unsupported" ||
    support === "unknown" ||
    resolutionError?.code === "invalid_sample"
  ) {
    const code =
      support === "unsupported"
        ? "unsupported_attribute"
        : support === "unknown"
          ? "support_unknown"
          : "invalid_sample";
    return (
      <span className={cn("text-muted-foreground", className)}>
        {td(`commandReasons.${code}`)}
      </span>
    );
  }
  if (typeof value === "boolean") {
    return (
      <span
        className={cn(
          "inline-flex min-w-0 items-center gap-[0.4em]",
          faultClass,
          className,
        )}
      >
        <BooleanIndicator tone={level ?? "neutral"} filled={value} />
        {/* self-baseline: the row aligns on the text, not on the dot's bottom edge */}
        <span className="self-baseline truncate">
          {labelFor(value, valueLabels)}
        </span>
      </span>
    );
  }
  if (faultClass) {
    return (
      <span className={cn(faultClass, className)}>
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
    const label = attributeValueLabel(attributeName, value, t);
    return (
      <span
        className={cn("inline-flex items-center gap-[0.4em]", color, className)}
      >
        <Icon
          className={cn("size-[1.15em] shrink-0", rotate && "rotate-90")}
          aria-hidden
        />
        <span className="self-baseline">{label ?? String(value)}</span>
      </span>
    );
  }

  const text = formatValue(value, dataType);
  return (
    <span className={className}>
      {typeof value === "number" && unit ? `${text} ${unit}` : text}
    </span>
  );
}
