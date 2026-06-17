import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import {
  getConnectionStatus,
  isPhysicalDevice,
  type Device,
  type PhysicalDevice,
} from "@/api/devices";
import { useDeleteDevice } from "@/hooks/useDeleteDevice";
import { usePermissions } from "@/contexts/AuthContext";

export function DeviceHeader({ device }: { device: Device }) {
  return (
    <ResourceHeader
      title={device.name || device.id}
      status={<DeviceStatus device={device} />}
      caption={
        isPhysicalDevice(device) ? <PhysicalDeviceMeta device={device} /> : null
      }
      actions={<DeviceActions device={device} />}
    />
  );
}

function DeviceStatus({ device }: { device: Device }) {
  const { t } = useTranslation("common");
  return (
    <>
      <DeviceTypeChip type={device.type} />
      <ConnectionStatusBadge status={getConnectionStatus(device)} />
      {!isPhysicalDevice(device) && (
        <Badge variant="outline">{t("common.deviceKinds.virtual")}</Badge>
      )}
    </>
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

function DeviceActions({ device }: { device: Device }) {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const { handleDelete, isDeleting } = useDeleteDevice();

  if (!can("devices:write")) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button asChild size="sm">
        <Link to={`/devices/${device.id}/commands/new`}>
          <Terminal className="h-3.5 w-3.5" />
          {t("commands.newCommand")}
        </Link>
      </Button>
      <ResourceDeleteButton
        onDelete={() => handleDelete(device.id)}
        isDeleting={isDeleting}
        confirmTitle={t("devices.actions.deleteDialogTitle")}
        confirmDetails={t("devices.actions.deleteDialogContent", {
          name: device.name || device.id,
        })}
        deleteLabel={t("devices.actions.delete")}
      />
    </div>
  );
}
