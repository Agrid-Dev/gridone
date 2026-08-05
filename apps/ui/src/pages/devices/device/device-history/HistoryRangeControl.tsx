import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type TimeRangePreset, rangeLabel } from "@/lib/timeRange";
import { cn } from "@/lib/utils";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

const SEGMENTS: { preset: TimeRangePreset; labelKey: string }[] = [
  { preset: "1d", labelKey: "history.range24h" },
  { preset: "7d", labelKey: "history.range7d" },
  { preset: "1mo", labelKey: "history.range30d" },
];

const itemClass = (active: boolean) =>
  cn(
    "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

/**
 * Segmented period control: 24 h / 7 j / 30 j plus a custom popover. A range
 * that maps to no segment (an off-ladder preset from a shared link, or a
 * custom window) lights the custom segment, labelled with the actual range.
 */
export function HistoryRangeControl() {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const { timeRange, applyRange, applyPreset } = useDeviceHistoryContext();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const activePreset = timeRange.kind === "preset" ? timeRange.preset : null;
  const inSegments = SEGMENTS.some((s) => s.preset === activePreset);
  const customLabel =
    activePreset && !inSegments
      ? rangeLabel(timeRange, tCommon)
      : t("history.rangeCustom");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && timeRange.kind === "custom") {
      setCustomStart(timeRange.start.slice(0, 16));
      setCustomEnd(timeRange.end.slice(0, 16));
    }
    setOpen(nextOpen);
  };

  const handleCustomApply = () => {
    applyRange({ kind: "custom", start: customStart, end: customEnd });
    setOpen(false);
  };

  const nowLocal = new Date().toISOString().slice(0, 16);

  return (
    <div className="inline-flex items-center rounded-md bg-muted p-1">
      {SEGMENTS.map(({ preset, labelKey }) => (
        <button
          key={preset}
          type="button"
          aria-pressed={activePreset === preset}
          onClick={() => applyPreset(preset)}
          className={itemClass(activePreset === preset)}
        >
          {t(labelKey as "history.range24h")}
        </button>
      ))}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={!inSegments}
            className={itemClass(!inSegments)}
          >
            {customLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {tCommon("timeRange.rangeCustom")}
          </p>
          <input
            type="datetime-local"
            aria-label="start"
            className="w-full rounded-md border px-2 py-1 text-sm"
            max={nowLocal}
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <input
            type="datetime-local"
            aria-label="end"
            className="w-full rounded-md border px-2 py-1 text-sm"
            max={nowLocal}
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleCustomApply}
          >
            {tCommon("timeRange.rangeApply")}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
