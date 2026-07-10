import { ResourceHeader } from "@/components/ResourceHeader";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import type { Device } from "@gridone/sdk";
import { getConnectionStatus } from "@/lib/devices";

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
  return (
    <>
      <DeviceTypeChip type={device.type} />
      <ConnectionStatusBadge status={getConnectionStatus(device)} />
      <DeviceFaultBadge device={device} />
    </>
  );
}
