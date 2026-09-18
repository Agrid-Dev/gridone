import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { Cpu } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyValue } from "@/components/EmptyValue";
import {
  ConnectionStatusDot,
  ConnectionStatusValue,
} from "@/components/ConnectionStatusBadge";
import { getConnectionStatus } from "@/lib/devices";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import {
  deviceMeasureReading,
  deviceSetpointReading,
  formatReading,
} from "@/lib/deviceSummary";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { DeviceModeValue } from "./DeviceModeValue";

/** One device of the fleet table. The whole row navigates to the device
 *  detail; the name stays a real link for accessibility. */
export function DeviceRow({
  device,
  zoneName,
}: {
  device: Device;
  zoneName: string | null;
}) {
  const { open: navigate } = useResourceNavigation();
  const { i18n } = useTranslation();
  const status = getConnectionStatus(device);
  const canSeeConnectionStatus = useCanSeeConnectionStatus();
  const Icon = deviceTypeIcon(device.type) ?? Cpu;

  return (
    <TableRow
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a,button,input,select"))
          navigate(`/devices/${device.id}`);
      }}
      className="cursor-pointer"
    >
      <TableCell className="py-2.5">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <Link
            to={`/devices/${device.id}`}
            className="font-medium text-primary hover:underline focus-visible:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {device.name || device.id}
          </Link>
        </span>
      </TableCell>
      <TableCell className="py-2.5 text-muted-foreground">
        {zoneName ?? <EmptyValue />}
      </TableCell>
      <TableCell className="py-2.5 text-right text-sm tabular-nums">
        {formatReading(deviceMeasureReading(device), i18n.language)}
      </TableCell>
      <TableCell className="py-2.5 text-right text-sm tabular-nums text-muted-foreground">
        {formatReading(deviceSetpointReading(device), i18n.language)}
      </TableCell>
      <TableCell className="py-2.5">
        <DeviceModeValue device={device} />
      </TableCell>
      {canSeeConnectionStatus && (
        <TableCell className="py-2.5">
          <span className="flex items-center gap-2">
            <ConnectionStatusDot status={status} />
            <ConnectionStatusValue status={status} />
          </span>
        </TableCell>
      )}
      <TableCell className="py-2.5">
        <FaultsCell device={device} />
      </TableCell>
    </TableRow>
  );
}

function FaultsCell({ device }: { device: Device }) {
  return <DeviceFaultBadge device={device} />;
}
