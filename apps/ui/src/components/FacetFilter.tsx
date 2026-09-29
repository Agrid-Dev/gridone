import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FacetOption = {
  value: string;
  label: string;
  count: number;
};

/** Past this many options the popover grows a search box. */
const SEARCH_THRESHOLD = 7;

type FacetFilterProps = {
  title: string;
  options: readonly FacetOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** Shown in the trigger while nothing is selected (e.g. a fault count). */
  summary?: ReactNode;
  /** `single` makes the options radio-like: picking one replaces the
   *  selection, picking the selected one clears it. */
  selection?: "multiple" | "single";
  searchPlaceholder: string;
  emptyMessage: string;
  clearLabel: string;
};

/** One filter dimension as a compact popover of checkable options with
 *  counts. The trigger names the dimension and, once narrowed, the first
 *  selected option ("Type | Thermostats +2"). It always renders: options
 *  without matches are dimmed rather than removed, so the toolbar keeps the
 *  same shape whatever the data. Selection is controlled by the caller. */
export function FacetFilter({
  title,
  options,
  selected,
  onChange,
  summary,
  selection = "multiple",
  searchPlaceholder,
  emptyMessage,
  clearLabel,
}: FacetFilterProps) {
  const isSelected = (value: string) => selected.includes(value);
  const toggle = (value: string) =>
    onChange(
      isSelected(value)
        ? selected.filter((current) => current !== value)
        : selection === "single"
          ? [value]
          : [...selected, value],
    );
  const firstSelected = options.find((option) => isSelected(option.value));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "gap-2",
            selected.length
              ? "border-primary bg-primary/10 hover:bg-primary/15"
              : "border-dashed",
          )}
        >
          {title}
          {(firstSelected || summary) && (
            <span aria-hidden className="h-4 w-px bg-border" />
          )}
          {firstSelected ? (
            <span className="font-semibold">
              {firstSelected.label}
              {selected.length > 1 && ` +${selected.length - 1}`}
            </span>
          ) : (
            summary
          )}
          <ChevronDown className="h-4 w-4 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {options.length > SEARCH_THRESHOLD && (
            <CommandInput placeholder={searchPlaceholder} />
          )}
          <CommandList className="max-h-[420px]">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => toggle(option.value)}
                  aria-checked={isSelected(option.value)}
                  className={cn(!option.count && "text-muted-foreground")}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-4 w-4 items-center justify-center border",
                      selection === "single" ? "rounded-full" : "rounded-sm",
                      isSelected(option.value)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/50",
                    )}
                  >
                    {isSelected(option.value) && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{option.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {option.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange([])}
                    className="justify-center"
                  >
                    {clearLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
