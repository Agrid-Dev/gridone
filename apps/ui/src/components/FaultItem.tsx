import type { KeyboardEvent } from "react";
import { CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SeverityChip } from "./SeverityChip";
import type { FaultAttribute } from "@/api/devices";
import { faultLabel } from "@/lib/faultLabel";
import { cn, formatTimeAgo } from "@/lib/utils";

type FaultItemProps = {
  attribute: FaultAttribute;
  onClick?: () => void;
};

export function FaultItem({ attribute, onClick }: FaultItemProps) {
  const { t } = useTranslation();
  const label = faultLabel(attribute);
  const interactive = Boolean(onClick);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  const rowClass = cn(
    "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
    attribute.isFaulty
      ? "bg-background border-border"
      : "bg-muted/30 text-muted-foreground border-border",
    interactive &&
      "cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  const rightText = attribute.isFaulty
    ? t("common.faults.activeSince", {
        ago: relativeLastChanged(attribute.lastChanged, t),
      })
    : t("common.faults.ok");

  return (
    <div
      className={rowClass}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        {attribute.isFaulty ? (
          <SeverityChip severity={attribute.severity} />
        ) : (
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {rightText}
      </span>
    </div>
  );
}

function relativeLastChanged(
  lastChanged: string | null,
  t: (key: string, options?: unknown) => string,
): string {
  if (!lastChanged) return t("common.timeAgo.justNow");
  const timestamp = new Date(lastChanged).getTime();
  if (Number.isNaN(timestamp)) return t("common.timeAgo.justNow");
  return formatTimeAgo(timestamp, t);
}
