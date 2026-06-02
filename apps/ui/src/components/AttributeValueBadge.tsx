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
import { cn } from "@/lib/utils";

type ValueRenderer = { Icon: LucideIcon; color: string; rotate?: boolean };

/** Keyed by raw attribute name (snake_case as in DeviceAttribute.name),
 *  then by option value string. Covers mode and fan_speed for thermostat/awhp. */
const STANDARD_VALUE_RENDERERS: Record<
  string,
  Record<string, ValueRenderer>
> = {
  mode: {
    heat: { Icon: Sun, color: "text-orange-500" },
    cool: { Icon: Snowflake, color: "text-blue-500" },
    fan: { Icon: Fan, color: "text-green-500" },
    auto: { Icon: RefreshCcwDot, color: "text-amber-500" },
  },
  fan_speed: {
    low: { Icon: SignalLow, color: "text-muted-foreground" },
    medium: { Icon: SignalMedium, color: "text-muted-foreground" },
    high: { Icon: SignalHigh, color: "text-muted-foreground" },
    auto: {
      Icon: ArrowUpNarrowWide,
      color: "text-muted-foreground",
      rotate: true,
    },
  },
};

type AttributeValueBadgeProps = {
  attributeName: string;
  value: string | number | boolean;
  className?: string;
};

/** Renders a discrete attribute value with an icon and colour when the
 *  (attributeName, value) pair has a known standard renderer; falls back
 *  to a plain text label otherwise. */
export function AttributeValueBadge({
  attributeName,
  value,
  className,
}: AttributeValueBadgeProps) {
  const renderer = STANDARD_VALUE_RENDERERS[attributeName]?.[String(value)];
  const label = String(value);

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
