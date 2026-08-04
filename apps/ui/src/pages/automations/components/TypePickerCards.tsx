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
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              selected
                ? "border-primary/60 bg-primary/5"
                : "border-border hover:border-primary/40",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                selected
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              {description && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
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
