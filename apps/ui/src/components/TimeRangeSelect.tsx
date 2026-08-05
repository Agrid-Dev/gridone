import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTimeRangeUrlState } from "@/hooks/useTimeRangeUrlState";
import {
  type PresetOption,
  type TimeRangePreset,
  DEFAULT_PRESET,
  PRESET_OPTIONS,
  rangeLabel,
} from "@/lib/timeRange";

type TimeRangeSelectProps = {
  onChangeParamsReset?: string[];
  /** Preset shown when no time params are in the URL. Defaults to 3h; pass
   *  "all" for views that should start unfiltered (e.g. commands). */
  defaultPreset?: TimeRangePreset;
  /** Presets offered in the popover. Defaults to the device-scoped ladder;
   *  views whose useful windows differ pass their own (e.g. dashboards). */
  presets?: PresetOption[];
  /** Opt in to remembering the picked preset under this key. Views without one
   *  keep their period for the lifetime of the URL only. */
  storageKey?: string;
};

export function TimeRangeSelect({
  onChangeParamsReset = [],
  defaultPreset = DEFAULT_PRESET,
  presets = PRESET_OPTIONS,
  storageKey,
}: TimeRangeSelectProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { timeRange, applyRange, applyPreset } = useTimeRangeUrlState({
    defaultPreset,
    onChangeParamsReset,
    storageKey,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && timeRange.kind === "custom") {
      setCustomStart(timeRange.start.slice(0, 16));
      setCustomEnd(timeRange.end.slice(0, 16));
    }
    setOpen(nextOpen);
  };

  const handlePreset = (preset: TimeRangePreset) => {
    applyPreset(preset);
    setOpen(false);
  };

  const handleCustomApply = () => {
    applyRange({ kind: "custom", start: customStart, end: customEnd });
    setOpen(false);
  };

  const activePreset = timeRange.kind === "preset" ? timeRange.preset : null;
  const nowLocal = new Date().toISOString().slice(0, 16);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="mr-2 h-4 w-4" />
          {rangeLabel(timeRange, t)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex flex-col gap-1">
          {presets.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                activePreset === option.value
                  ? "bg-accent font-medium text-accent-foreground"
                  : "hover:bg-muted"
              }`}
              onClick={() => handlePreset(option.value)}
            >
              {t(
                `timeRange.${option.unitKey}` as "timeRange.rangeLastMinutes",
                {
                  count: option.count,
                },
              )}
            </button>
          ))}
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
              activePreset === "all"
                ? "bg-accent font-medium text-accent-foreground"
                : "hover:bg-muted"
            }`}
            onClick={() => handlePreset("all")}
          >
            {t("timeRange.rangeAll")}
          </button>
        </div>

        <Separator className="my-2" />

        <div className="space-y-2 px-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {timeRange.kind === "custom" && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-foreground" />
            )}
            {t("timeRange.rangeCustom")}
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
            {t("timeRange.rangeApply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
