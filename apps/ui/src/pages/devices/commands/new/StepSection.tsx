import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "pending" | "active" | "done";

type StepSectionProps = {
  number: number;
  title: string;
  state: StepState;
  summary?: ReactNode;
  children?: ReactNode;
};

export function StepSection({
  number,
  title,
  state,
  summary,
  children,
}: StepSectionProps) {
  return (
    <section className={cn(state === "pending" && "opacity-60")}>
      <header className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
            state === "done" &&
              "border-primary bg-primary text-primary-foreground",
            state === "active" && "border-primary text-primary bg-background",
            state === "pending" &&
              "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          {state === "done" ? <Check className="h-3.5 w-3.5" /> : number}
        </span>
        <h2
          className={cn(
            "flex-1 text-sm font-semibold",
            state === "pending" && "text-muted-foreground",
          )}
        >
          {title}
        </h2>
      </header>

      {state === "done" && summary && (
        <div className="pl-10 pt-2 text-sm">{summary}</div>
      )}

      {state === "active" && children && (
        <div
          key={number}
          className="pl-10 pt-4 animate-in fade-in slide-in-from-top-2 duration-300"
        >
          {children}
        </div>
      )}
    </section>
  );
}
