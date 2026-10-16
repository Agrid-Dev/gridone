import { useState } from "react";
import { CustomTimeRangeForm } from "./CustomTimeRangeForm";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type TimeRange,
  type TimeRangePreset,
  rangeLabel,
} from "@/lib/timeRange";
import { cn } from "@/lib/utils";

const SEGMENTS: { preset: TimeRangePreset; labelKey: string }[] = [
  { preset: "1d", labelKey: "timeRange.segment24h" },
  { preset: "7d", labelKey: "timeRange.segment7d" },
  { preset: "1mo", labelKey: "timeRange.segment30d" },
];

/** A segment of a segmented control, raised while selected. */
export const segmentItemClass = (active: boolean) =>
  cn(
    "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

type TimeRangeSegmentsProps = {
  timeRange: TimeRange;
  applyRange: (range: TimeRange) => void;
  applyPreset: (preset: TimeRangePreset) => void;
};

/**
 * Segmented period control: 24 h / 7 j / 30 j plus a custom popover, for a
 * view reading its period from `useTimeRangeUrlState`. A range that maps to no
 * segment (an off-ladder preset from a shared link, or a custom window) lights
 * the custom segment, labelled with the actual range.
 */
export function TimeRangeSegments({
  timeRange,
  applyRange,
  applyPreset,
}: TimeRangeSegmentsProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  const activePreset = timeRange.kind === "preset" ? timeRange.preset : null;
  const inSegments = SEGMENTS.some((s) => s.preset === activePreset);
  const customLabel =
    activePreset && !inSegments
      ? rangeLabel(timeRange, t)
      : t("timeRange.segmentCustom");

  return (
    <div className="inline-flex items-center rounded-md bg-muted p-1">
      {SEGMENTS.map(({ preset, labelKey }) => (
        <button
          key={preset}
          type="button"
          aria-pressed={activePreset === preset}
          onClick={() => applyPreset(preset)}
          className={segmentItemClass(activePreset === preset)}
        >
          {t(labelKey as "timeRange.segment24h")}
        </button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={!inSegments}
            className={segmentItemClass(!inSegments)}
          >
            {customLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2 p-3">
          <CustomTimeRangeForm
            timeRange={timeRange}
            onApply={(range) => {
              applyRange(range);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
