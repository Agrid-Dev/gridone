import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { cn } from "@/lib/utils";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

/**
 * Single-select metric pills driving the chart: one pill per standard numeric
 * attribute, plus a "More…" picker over the rest of the numeric catalog. A
 * metric picked there (or deep-linked) shows as a temporary trailing pill.
 */
export function MetricPillBar() {
  const { t } = useTranslation(["devices", "common"]);
  const { numericAttributes, pillAttributes, activeMetric, setActiveMetric } =
    useDeviceHistoryContext();
  const labelFor = useAttributeLabel();
  const [open, setOpen] = useState(false);

  if (numericAttributes.length === 0) return null;

  const pills =
    activeMetric && !pillAttributes.includes(activeMetric)
      ? [...pillAttributes, activeMetric]
      : pillAttributes;
  const extraAttributes = numericAttributes.filter((a) => !pills.includes(a));

  return (
    <div
      role="group"
      aria-label={t("history.metricsLabel")}
      className="flex flex-wrap items-center gap-2"
    >
      {pills.map((attr) => (
        <button
          key={attr}
          type="button"
          aria-pressed={attr === activeMetric}
          onClick={() => setActiveMetric(attr)}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
            attr === activeMetric
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          {labelFor(attr)}
        </button>
      ))}

      {extraAttributes.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("history.more")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <Command>
              <CommandInput placeholder={t("common:common.searchAttributes")} />
              <CommandList>
                <CommandEmpty>{t("common:common.noResults")}</CommandEmpty>
                <CommandGroup>
                  {extraAttributes.map((attr) => (
                    <CommandItem
                      key={attr}
                      value={attr}
                      keywords={[labelFor(attr)]}
                      onSelect={() => {
                        setActiveMetric(attr);
                        setOpen(false);
                      }}
                    >
                      {labelFor(attr)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
