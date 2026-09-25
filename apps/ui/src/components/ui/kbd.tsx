import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A key the user presses, as a shortcut hint writes it. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
