import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ExecutionStatus } from "@gridone/sdk";

/** Soft-tinted status badge, themed via tokens (mirrors the badge `success`
 *  variant; `failed` is its destructive counterpart). */
const statusStyles: Record<ExecutionStatus, string> = {
  success: "border-transparent bg-success/15 text-[hsl(var(--success))]",
  failed: "border-transparent bg-destructive/15 text-destructive",
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const { t } = useTranslation("automations");
  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {t(`executions.status.${status}`)}
    </Badge>
  );
}
