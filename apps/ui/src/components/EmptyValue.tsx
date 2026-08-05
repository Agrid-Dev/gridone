import { cn } from "@/lib/utils";

/** Consistent placeholder for a missing value in compact data displays. */
export function EmptyValue({ className }: { className?: string }) {
  return <span className={cn("text-muted-foreground", className)}>—</span>;
}
