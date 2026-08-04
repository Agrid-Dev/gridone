import { useTranslation } from "react-i18next";
import type { Severity } from "@/lib/severity";
import { cn } from "@/lib/utils";

/** Text colour per severity. `info` stays neutral rather than taking the
 *  saturated `--status-info` blue: a column of faults is scanned for what
 *  needs acting on, and colouring the "for information" rows as loudly as the
 *  actionable ones flattens that hierarchy. `SeverityChip` greys `info` for
 *  the same reason. */
const TEXT_CLASS: Record<Severity, string> = {
  alert: "text-status-error",
  warning: "text-status-warning",
  info: "text-muted-foreground",
};

/** Dot fill per severity, mirroring {@link TEXT_CLASS}. */
const DOT_CLASS: Record<Severity, string> = {
  alert: "bg-status-error",
  warning: "bg-status-warning",
  info: "bg-muted-foreground",
};

type SeverityLabelProps = {
  severity: Severity;
  className?: string;
};

/** Severity as a coloured dot plus its coloured name — the quiet register the
 *  faults table needs, where a column of solid `SeverityChip` badges would
 *  out-shout the device names beside them. Detail pages keep the badge. */
export function SeverityLabel({ severity, className }: SeverityLabelProps) {
  const { t } = useTranslation();

  return (
    <span
      data-severity={severity}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium capitalize",
        TEXT_CLASS[severity],
        className,
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[severity])}
        aria-hidden
      />
      {t(`common.severity.${severity}`)}
    </span>
  );
}
