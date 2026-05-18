import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ControlPanelProps = {
  size?: "sm" | "lg";
  modeChip?: ReactNode;
  headerLabel?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function ControlPanel({
  size = "sm",
  modeChip,
  headerLabel,
  footer,
  children,
}: ControlPanelProps) {
  const hasHeader = Boolean(modeChip || headerLabel);

  return (
    <div
      className={cn(
        "mx-auto w-full rounded-2xl border bg-card shadow-lg",
        size === "lg" ? "max-w-2xl" : "max-w-sm",
      )}
    >
      {hasHeader && (
        <div className="grid grid-cols-3 items-center gap-3 px-6 pt-5">
          <div className="min-w-0">{modeChip}</div>
          <div className="min-w-0 text-center">{headerLabel}</div>
          <div />
        </div>
      )}
      <div className="px-6 py-6">{children}</div>
      {footer && <div className="px-6 pb-6">{footer}</div>}
    </div>
  );
}
