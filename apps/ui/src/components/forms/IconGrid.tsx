import type { ComponentType, ReactNode } from "react";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export type IconComponent = ComponentType<{ className?: string }>;

const cellClass = (selected: boolean) =>
  cn(
    "flex h-10 w-10 items-center justify-center rounded-md border transition-colors",
    selected
      ? "border-primary bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

/** A grid of icons to pick one from, drawn with the icons themselves and
 *  labelled by their keys. With `noneLabel`, a first cell clears the choice. */
export function IconGrid<K extends string>({
  icons,
  value,
  onChange,
  noneLabel,
  columns = 6,
}: {
  icons: Record<K, IconComponent>;
  value: K | null;
  onChange: (value: K | null) => void;
  noneLabel?: ReactNode;
  columns?: 6 | 8;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 8 ? "grid-cols-8" : "grid-cols-6",
      )}
    >
      {noneLabel !== undefined && (
        <button
          type="button"
          aria-label={typeof noneLabel === "string" ? noneLabel : undefined}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={cellClass(value === null)}
        >
          <Ban aria-hidden className="h-5 w-5" />
        </button>
      )}
      {(Object.keys(icons) as K[]).map((key) => {
        const Icon: IconComponent = icons[key];
        return (
          <button
            key={key}
            type="button"
            aria-label={key}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={cellClass(value === key)}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}
