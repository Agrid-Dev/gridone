import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@/api/apps";

const statusStyles: Record<AppStatus, string> = {
  healthy: "border-green-200 bg-green-100 text-green-800",
  unhealthy: "border-red-200 bg-red-100 text-red-800",
  registered: "border-slate-200 bg-slate-100 text-slate-600",
};

export function AppStatusBadge({ status }: { status: AppStatus }) {
  const { t } = useTranslation();

  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {t(`apps.status.${status}`)}
    </Badge>
  );
}
