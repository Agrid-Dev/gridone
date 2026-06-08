import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, History, Pencil, Terminal } from "lucide-react";
import { Button } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import {
  getConnectionStatus,
  isPhysicalDevice,
  type Device,
  type PhysicalDevice,
} from "@/api/devices";
import { usePermissions } from "@/contexts/AuthContext";

export function DeviceHeader({ device }: { device: Device }) {
  return (
    <div className="pb-6 border-b border-border">
      <BackLink />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <TitleRow device={device} />
          {isPhysicalDevice(device) && <PhysicalDeviceMeta device={device} />}
        </div>
        <DeviceActions />
      </div>
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation("devices");
  return (
    <Link
      to="/devices"
      className="group mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      {t("devices.title")}
    </Link>
  );
}

function TitleRow({ device }: { device: Device }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-3">
      <h1 className="truncate font-display text-2xl font-semibold text-foreground">
        {device.name || device.id}
      </h1>
      <DeviceTypeChip type={device.type} />
      <ConnectionStatusBadge status={getConnectionStatus(device)} />
      {!isPhysicalDevice(device) && (
        <Badge variant="outline">{t("common.deviceKinds.virtual")}</Badge>
      )}
    </div>
  );
}

function PhysicalDeviceMeta({ device }: { device: PhysicalDevice }) {
  const { t } = useTranslation("common");
  const configEntries = Object.entries(device.config);

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span className="inline-flex items-baseline gap-1.5">
        {t("common.driver")}
        <Link
          to={`/drivers/${device.driverId}`}
          className="font-mono text-xs text-primary transition-colors hover:text-primary/70"
        >
          {device.driverId}
        </Link>
      </span>
      <span className="text-border">|</span>
      <span className="inline-flex items-baseline gap-1.5">
        {t("common.transport")}
        <span className="font-mono text-xs text-foreground">
          {device.transportId}
        </span>
      </span>
      {configEntries.length > 0 && (
        <>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            {configEntries.map(([key, value], i) => (
              <span key={key} className="font-mono text-xs">
                {i > 0 && <span className="text-muted-foreground"> · </span>}
                <span className="text-muted-foreground">{key}=</span>
                <span className="text-foreground">{String(value)}</span>
              </span>
            ))}
          </span>
        </>
      )}
    </div>
  );
}

function DeviceActions() {
  const { t } = useTranslation("devices");
  const can = usePermissions();

  return (
    <div className="flex shrink-0 gap-2">
      {can("devices:write") && (
        <Button asChild variant="outline" size="sm">
          <Link to="edit">
            <Pencil className="h-3.5 w-3.5" />
            {t("devices.actions.edit")}
          </Link>
        </Button>
      )}
      <Button asChild variant="outline" size="sm">
        <Link to="history">
          <History className="h-3.5 w-3.5" />
          {t("deviceDetails.history")}
        </Link>
      </Button>
      {can("devices:write") && (
        <Button asChild size="sm">
          <Link to="commands/new">
            <Terminal className="h-3.5 w-3.5" />
            {t("commands.newCommand")}
          </Link>
        </Button>
      )}
    </div>
  );
}
