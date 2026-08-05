import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CHART_COLORS,
  OTHER_COLOR,
} from "@/components/charts/TimeSeriesChart/constants";
import {
  attributeValueChartColor,
  semanticChartColor,
} from "@/lib/semanticColors";
import type { MergedRow } from "@/lib/mergeTimeSeries";
import {
  OTHER_VALUE,
  computeStateSegments,
  type StateShare,
} from "./stateSegments";

/** Colour for a boolean "no" segment — present but visually quiet. */
const BOOL_OFF_COLOR = "hsl(var(--muted-foreground) / 0.35)";

/** Colour for the stretch before the series first recorded. */
const NO_DATA_COLOR = "hsl(var(--muted))";

/**
 * Display label for a state value. Booleans read as run states ("Marche" /
 * "Arrêt" — the dominant meaning of a recorded bool in a BMS); enum values go
 * through the shared HVAC-mode vocabulary and fall back to the raw value.
 */
function valueLabel(t: TFunction<"common">, value: string): string {
  const normalized =
    value === "true" ? "on" : value === "false" ? "off" : value;
  return t(`common.hvacMode.${normalized}` as "common.hvacMode.on", {
    defaultValue: value,
  });
}

/** Elapsed-duration label from a span in milliseconds. */
function durationLabel(t: TFunction<"common">, ms: number): string {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return t("common.duration.days", { count: days });
  if (hours > 0) return t("common.duration.hours", { count: hours });
  if (minutes > 0) return t("common.duration.minutes", { count: minutes });
  return t("common.duration.lessThanAMinute");
}

type StateTimelineProps = {
  attr: string;
  label: string;
  /** Chart rows (held to the window end) covering this attribute. */
  rows: MergedRow[];
};

/**
 * One horizontal state band: segments proportional to how long each value was
 * held, with a duration-weighted legend ("Chauffage 53 %"). Colours resolve
 * from the semantic registry first, then the chart palette by rank; values
 * beyond the display cap render (and count) as "other".
 */
export function StateTimeline({ attr, label, rows }: StateTimelineProps) {
  const { t, i18n } = useTranslation("common");
  const { t: tDevices } = useTranslation("devices");

  const { segments, shares } = useMemo(
    () => computeStateSegments(rows, attr),
    [rows, attr],
  );

  const colorByValue = useMemo(() => {
    const map = new Map<string, string>();
    let paletteIndex = 0;
    for (const share of shares) {
      if (share.value === OTHER_VALUE) continue;
      const color =
        share.value === "true"
          ? semanticChartColor("ok")
          : share.value === "false"
            ? BOOL_OFF_COLOR
            : attributeValueChartColor(attr, share.value);
      map.set(
        share.value,
        color ?? CHART_COLORS[paletteIndex++ % CHART_COLORS.length],
      );
    }
    return map;
  }, [shares, attr]);

  if (segments.length === 0) return null;

  const segmentColor = (value: string | null) =>
    value === null ? NO_DATA_COLOR : (colorByValue.get(value) ?? OTHER_COLOR);

  const timeFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "short",
    timeStyle: "short",
  });

  const shareLabel = (share: StateShare) =>
    share.value === OTHER_VALUE
      ? tDevices("history.otherValues")
      : valueLabel(t, share.value);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {shares.map((share) => (
          <span
            key={share.value}
            className="inline-flex items-center gap-1.5 text-xs"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: segmentColor(share.value) }}
            />
            <span className="text-muted-foreground">{shareLabel(share)}</span>
            <span className="font-mono font-medium tabular-nums">
              {share.pct}
              &nbsp;%
            </span>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex h-3 gap-px overflow-hidden rounded">
        {segments.map((segment, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className="min-w-0 shrink-0 basis-0"
                style={{
                  flexGrow: segment.endMs - segment.startMs,
                  backgroundColor: segmentColor(segment.value),
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">
                {segment.value === null
                  ? t("common.noData")
                  : valueLabel(t, segment.value)}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeFormat.format(new Date(segment.startMs))} —{" "}
                {timeFormat.format(new Date(segment.endMs))} ·{" "}
                {durationLabel(t, segment.endMs - segment.startMs)}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
