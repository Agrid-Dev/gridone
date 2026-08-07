import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TypePickerOption {
  value: string;
  label: string;
  description?: string;
  icon: LucideIcon;
}

interface TypePickerCardsProps {
  options: TypePickerOption[];
  value?: string;
  onSelect: (value: string) => void;
  "aria-label": string;
}

/** Visual radio group: one selectable card per trigger/action type, replacing
 *  the dropdown pickers so the choice is readable at a glance. */
export function TypePickerCards({
  options,
  value,
  onSelect,
  "aria-label": ariaLabel,
}: TypePickerCardsProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2 sm:grid-cols-2"
    >
      {options.map(({ value: optionValue, label, description, icon: Icon }) => {
        const selected = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(optionValue)}
            className={cn(
              "flex min-w-0 flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors",
              selected
                ? "border-primary/60 bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                "h-5 w-5 shrink-0",
                selected ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  selected && "text-primary",
                )}
              >
                {label}
              </span>
              {description && (
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
