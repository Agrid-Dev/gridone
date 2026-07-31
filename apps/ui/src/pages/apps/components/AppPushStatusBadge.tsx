import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { PushStatus } from "@gridone/sdk";

const statusStyles: Record<PushStatus, string> = {
  ok: "border-green-200 bg-green-100 text-green-800",
  pending: "border-amber-200 bg-amber-100 text-amber-800",
  rejected: "border-red-200 bg-red-100 text-red-800",
};

/**
 * How the stored config reached the app.
 *
 * Saving stores the config and pushes it best-effort, so "saved" and
 * "delivered" are two different facts: `pending` means gridone holds a config
 * the app has not taken yet (the health loop keeps retrying), `rejected` that
 * the app refused it. Nothing to show before a first save.
 */
export const AppPushStatusBadge: FC<{ status?: PushStatus | null }> = ({
  status,
}) => {
  const { t } = useTranslation("apps");

  if (!status) return null;

  return (
    <Badge
      variant="outline"
      className={statusStyles[status]}
      title={t(`config.pushStatusHint.${status}`)}
    >
      {t(`config.pushStatus.${status}`)}
    </Badge>
  );
};
