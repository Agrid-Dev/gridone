import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RuleChipProps {
  icon: LucideIcon;
  children: ReactNode;
  /** Dashed outline for a rule side not configured yet (wizard preview). */
  placeholder?: boolean;
  className?: string;
}

/** Compact pill used to render one side of a rule sentence. */
export function RuleChip({
  icon: Icon,
  children,
  placeholder,
  className,
}: RuleChipProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground/90",
        placeholder &&
          "border-dashed bg-transparent font-normal text-muted-foreground",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          placeholder ? "text-muted-foreground/70" : "text-primary/70",
        )}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}
