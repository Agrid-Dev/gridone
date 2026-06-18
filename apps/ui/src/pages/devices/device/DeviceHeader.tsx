import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import {
  getConnectionStatus,
  isPhysicalDevice,
  type Device,
} from "@/api/devices";

export function DeviceHeader({ device }: { device: Device }) {
  return (
    <ResourceHeader
      flush
      title={device.name || device.id}
      status={<DeviceStatus device={device} />}
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
