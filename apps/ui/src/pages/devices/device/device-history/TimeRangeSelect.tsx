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
import {
  type TimeRange,
  type TimeRangePreset,
  PRESET_OPTIONS,
  rangeLabel,
} from "./timeRange";

type TimeRangeSelectProps = {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
};

export function TimeRangeSelect({ value, onChange }: TimeRangeSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && value.kind === "custom") {
      setCustomStart(value.start.slice(0, 16));
      setCustomEnd(value.end.slice(0, 16));
    }
    setOpen(nextOpen);
  };

  const handlePreset = (preset: TimeRangePreset) => {
    onChange({ kind: "preset", preset });
    setOpen(false);
  };

  const handleCustomApply = () => {
    onChange({ kind: "custom", start: customStart, end: customEnd });
    setOpen(false);
  };

  const activePreset = value.kind === "preset" ? value.preset : null;
  const nowLocal = new Date().toISOString().slice(0, 16);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="mr-2 h-4 w-4" />
          {rangeLabel(value, t)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex flex-col gap-1">
          {PRESET_OPTIONS.map((option) => (
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
              {t(`deviceDetails.${option.unitKey}`, { count: option.count })}
            </button>
          ))}
        </div>

        <Separator className="my-2" />

        <div className="space-y-2 px-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {value.kind === "custom" && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-foreground" />
            )}
            {t("deviceDetails.rangeCustom")}
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
            {t("deviceDetails.rangeApply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
