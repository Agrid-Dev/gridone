import type { ComponentType, ReactNode } from "react";
import { Activity, Clock, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SEMANTIC_BG_CLASS,
  SEMANTIC_TEXT_CLASS,
  type StatusLevel,
} from "@/lib/semanticColors";
import { ConnectionStatus } from "@/lib/devices";

const STATUS_CONFIG: Record<
  ConnectionStatus,
  {
    variant: BadgeProps["variant"];
    Icon: ComponentType<{ className?: string }>;
    labelKey:
      | "deviceDetails.connectionStatus.idle"
      | "deviceDetails.connectionStatus.ok"
      | "deviceDetails.connectionStatus.degraded"
      | "deviceDetails.connectionStatus.error";
  }
> = {
  [ConnectionStatus.Idle]: {
    variant: "outline",
    Icon: Clock,
    labelKey: "deviceDetails.connectionStatus.idle",
  },
  [ConnectionStatus.Ok]: {
    variant: "success",
    Icon: Wifi,
    labelKey: "deviceDetails.connectionStatus.ok",
  },
  [ConnectionStatus.Degraded]: {
    variant: "warning",
    Icon: Activity,
    labelKey: "deviceDetails.connectionStatus.degraded",
  },
  [ConnectionStatus.Error]: {
    variant: "destructive",
    Icon: WifiOff,
    labelKey: "deviceDetails.connectionStatus.error",
  },
};

/** Connection status mapped onto the shared semantic colour levels. */
export const STATUS_LEVEL: Record<ConnectionStatus, StatusLevel> = {
  [ConnectionStatus.Idle]: "info",
  [ConnectionStatus.Ok]: "ok",
  [ConnectionStatus.Degraded]: "warning",
  [ConnectionStatus.Error]: "error",
};

/** Connection status as a plain severity-coloured label (no badge chrome) —
 *  used where the value sits inline in a list, like the attribute panes. */
export function ConnectionStatusValue({
  status,
}: {
  status: ConnectionStatus | null;
}) {
  const { t } = useTranslation("devices");
  if (!status)
    return <span>{t("deviceDetails.connectionStatus.unknown")}</span>;
  return (
    <span
      className={cn("font-medium", SEMANTIC_TEXT_CLASS[STATUS_LEVEL[status]])}
    >
      {t(STATUS_CONFIG[status].labelKey)}
    </span>
  );
}

export function ConnectionStatusBadge({
  status,
  label,
}: {
  status: ConnectionStatus | null;
  label?: ReactNode;
}) {
  const { t } = useTranslation("devices");
  if (!status) return null;
  const { variant, Icon, labelKey } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label ?? t(labelKey)}
    </Badge>
  );
}

/** Connection status as a small solid dot — for tight chrome (card corners,
 *  widget headers, pickers) where a badge would crowd the row. Neutral when the
 *  status is unknown. Named by its status (tooltip + accessible label) unless
 *  `decorative`, for when the label is already written beside it. */
export function ConnectionStatusDot({
  status,
  className,
  decorative = false,
}: {
  status: ConnectionStatus | null;
  className?: string;
  decorative?: boolean;
}) {
  const { t } = useTranslation("devices");
  const label = status
    ? t(STATUS_CONFIG[status].labelKey)
    : t("deviceDetails.connectionStatus.unknown");
  return (
    <span
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label, title: label })}
      className={cn(
        "h-2 w-2 rounded-full",
        status
          ? SEMANTIC_BG_CLASS[STATUS_LEVEL[status]]
          : "bg-muted-foreground",
        className,
      )}
    />
  );
}
