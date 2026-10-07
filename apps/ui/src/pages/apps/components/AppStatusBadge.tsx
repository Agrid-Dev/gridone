import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@gridone/sdk";

const statusStyles: Record<AppStatus, string> = {
  healthy: "border-green-200 bg-green-100 text-green-800",
  needs_config: "border-amber-200 bg-amber-100 text-amber-800",
  unhealthy: "border-red-200 bg-red-100 text-red-800",
  registered: "border-border bg-muted text-muted-foreground",
};

/** An app's health, with the message of its last health report (if any) as
 *  the tooltip. */
export function AppStatusBadge({
  status,
  message,
}: {
  status: AppStatus;
  message?: string | null;
}) {
  const { t } = useTranslation("apps");

  return (
    <Badge
      variant="outline"
      className={statusStyles[status]}
      title={message ?? undefined}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}
