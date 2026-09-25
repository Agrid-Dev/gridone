import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Said by a screen reader and shown on hover, for a disabled choice. */
  title?: string;
};

/**
 * A row of mutually exclusive choices, each a button whose pressed state
 * is the selection: the tool, a height, a view. A handful of short labels;
 * a longer list is a select. Pressing the choice already made reports
 * nothing: it is no change.
 */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex gap-0.5 rounded-lg border bg-muted p-0.5", className)}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={on}
            disabled={option.disabled}
            title={option.title}
            onClick={() => {
              if (!on) onChange(option.value);
            }}
            className={cn(
              "flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              on
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
