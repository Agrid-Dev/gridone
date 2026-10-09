import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A top-level sidebar entry. 40 px on the desktop rail, 44 px in the touch
 *  drawer, which only opens below `lg`. The icon stays grey at rest so the
 *  label carries the row. */
export const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:min-h-10 [&>svg]:shrink-0",
    isActive
      ? "bg-accent text-accent-foreground [&>svg]:text-primary"
      : "text-foreground hover:bg-accent/60 [&>svg]:text-muted-foreground",
  );

/** Group heading. The sidebar's only uppercase text, so it reads as the level
 *  above every entry. Collapses its top spacing when it is the first item. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-1">
      {children}
    </p>
  );
}

/** Count on a nav item, rendered only when the count is non-zero.
 *  `destructive` is a pill that asks for attention (faults, pending requests);
 *  `neutral` is a plain grey number, an inventory count (devices). */
export function NavBadge({
  count,
  label,
  variant = "destructive",
}: {
  count: number;
  label: string;
  variant?: "destructive" | "neutral";
}) {
  return (
    <span
      aria-label={label}
      className={
        variant === "destructive"
          ? "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground"
          : "ml-auto text-xs tabular-nums text-muted-foreground"
      }
    >
      {count}
    </span>
  );
}
