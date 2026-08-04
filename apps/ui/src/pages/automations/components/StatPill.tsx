import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatPillProps {
  count: number;
  label: string;
  icon?: LucideIcon;
  /** Leading-dot color class (semantic bg token). Ignored when `icon` is set. */
  dotClassName?: string;
}

/** Header-level count pill: leading dot (or icon) + count + label. */
export function StatPill({
  count,
  label,
  icon: Icon,
  dotClassName,
}: StatPillProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
      {Icon ? (
        <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 rounded-full",
            dotClassName ?? "bg-muted-foreground/40",
          )}
        />
      )}
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
