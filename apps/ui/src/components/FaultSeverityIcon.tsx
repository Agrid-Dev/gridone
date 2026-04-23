import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Severity } from "@/api/devices";
import { cn } from "@/lib/utils";

const SEVERITY_ICON_CLASSES: Record<Severity, string> = {
  alert: "text-red-600",
  warning: "text-amber-500",
  info: "text-slate-500",
};

type FaultSeverityIconProps = {
  severity: Severity;
  className?: string;
};

export function FaultSeverityIcon({
  severity,
  className,
}: FaultSeverityIconProps) {
  const { t } = useTranslation();
  return (
    <TriangleAlert
      data-severity={severity}
      aria-label={t(`common.severity.${severity}`)}
      className={cn(
        "h-4 w-4 shrink-0",
        SEVERITY_ICON_CLASSES[severity],
        className,
      )}
    />
  );
}
