import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { ResourceHeader } from "@/components/ResourceHeader";
import { BackLink } from "@/components/BackLink";
import { AssetChip } from "@/components/AssetChip";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import { Button } from "@/components/ui/button";
import { useAssetTree } from "@/hooks/useAssetTree";
import type { Device } from "@gridone/sdk";
import { getConnectionStatus } from "@/lib/devices";

export function DeviceHeader({ device }: { device: Device }) {
  const { t } = useTranslation("devices");
  return (
    <div className="space-y-3">
      <BackLink to="/devices">{t("deviceDetails.backToDevices")}</BackLink>
      <ResourceHeader
        flush
        title={device.name || device.id}
        status={<DeviceStatus device={device} />}
        actions={
          <Button asChild>
            <Link to={`/devices/${device.id}/commands/new`}>
              <Terminal className="h-4 w-4" />
              {t("deviceDetails.sendCommand")}
            </Link>
          </Button>
        }
      />
    </div>
  );
}

function DeviceStatus({ device }: { device: Device }) {
  const { assetByDeviceId } = useAssetTree();
  return (
    <>
      <DeviceTypeChip type={device.type} />
      <ConnectionStatusBadge status={getConnectionStatus(device)} />
      <AssetChip asset={assetByDeviceId[device.id]} />
      <DeviceFaultBadge device={device} />
    </>
  );
}
