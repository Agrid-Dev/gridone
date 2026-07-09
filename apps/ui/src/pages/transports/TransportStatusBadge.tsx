import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { TransportConnectionState } from "@gridone/sdk";

const STATUS_VARIANT: Record<
  TransportConnectionState["status"],
  "success" | "warning" | "destructive" | "secondary"
> = {
  ok: "success",
  degraded: "warning",
  error: "destructive",
  idle: "secondary",
};

/** Renders a transport's connection status as a coloured badge. */
export const TransportStatusBadge: FC<{ state: TransportConnectionState }> = ({
  state,
}) => {
  const { t } = useTranslation("transports");
  return (
    <Badge variant={STATUS_VARIANT[state.status] ?? "secondary"}>
      {t(`status.${state.status}`, { defaultValue: t("status.unknown") })}
    </Badge>
  );
};
