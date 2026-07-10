import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ExecutionStatus } from "@gridone/sdk";

const statusStyles: Record<ExecutionStatus, string> = {
  success: "border-green-200 bg-green-100 text-green-800",
  failed: "border-red-200 bg-red-100 text-red-800",
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const { t } = useTranslation("automations");
  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {t(`executions.status.${status}`)}
    </Badge>
  );
}
