import type { ComponentType } from "react";
import { Activity, Clock, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "@/api/devices";

const STATUS_CONFIG: Record<
  ConnectionStatus,
  {
    variant: BadgeProps["variant"];
    Icon: ComponentType<{ className?: string }>;
    iconClass: string;
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
    iconClass: "text-muted-foreground",
    labelKey: "deviceDetails.connectionStatus.idle",
  },
  [ConnectionStatus.Ok]: {
    variant: "success",
    Icon: Wifi,
    iconClass: "text-green-500",
    labelKey: "deviceDetails.connectionStatus.ok",
  },
  [ConnectionStatus.Degraded]: {
    variant: "warning",
    Icon: Activity,
    iconClass: "text-yellow-500",
    labelKey: "deviceDetails.connectionStatus.degraded",
  },
  [ConnectionStatus.Error]: {
    variant: "destructive",
    Icon: WifiOff,
    iconClass: "text-destructive",
    labelKey: "deviceDetails.connectionStatus.error",
  },
};

/** Severity-style text colour per status, matching fault value colours. */
const STATUS_TEXT_COLOR: Record<ConnectionStatus, string> = {
  [ConnectionStatus.Idle]: "text-muted-foreground",
  [ConnectionStatus.Ok]: "text-green-600",
  [ConnectionStatus.Degraded]: "text-amber-600",
  [ConnectionStatus.Error]: "text-red-600",
};

/** Connection status as a plain severity-coloured label (no badge chrome) —
 *  used where the value sits inline in a list, like the attribute panes. */
export function ConnectionStatusValue({
  status,
}: {
  status: ConnectionStatus | null;
}) {
  const { t } = useTranslation("devices");
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-medium", STATUS_TEXT_COLOR[status])}>
      {t(STATUS_CONFIG[status].labelKey)}
    </span>
  );
}

export function ConnectionStatusBadge({
  status,
}: {
  status: ConnectionStatus | null;
}) {
  const { t } = useTranslation("devices");
  if (!status) return null;
  const { variant, Icon, labelKey } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {t(labelKey)}
    </Badge>
  );
}

export function ConnectionStatusIcon({
  status,
}: {
  status: ConnectionStatus | null;
}) {
  if (!status) return null;
  const { Icon, iconClass } = STATUS_CONFIG[status];
  return <Icon className={cn("h-3.5 w-3.5", iconClass)} />;
}
