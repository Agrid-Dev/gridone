import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { Severity } from "@/api/devices";
import { cn } from "@/lib/utils";

export type { Severity };

const SEVERITY_CLASSES: Record<Severity, string> = {
  alert: "bg-red-600 text-white border-transparent hover:bg-red-600",
  warning: "bg-amber-500 text-white border-transparent hover:bg-amber-500",
  info: "bg-transparent text-slate-700 border-slate-300 hover:bg-transparent",
};

type SeverityChipProps = {
  severity: Severity;
  className?: string;
};

export function SeverityChip({ severity, className }: SeverityChipProps) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      data-severity={severity}
      className={cn("uppercase", SEVERITY_CLASSES[severity], className)}
    >
      {t(`common.severity.${severity}`)}
    </Badge>
  );
}
