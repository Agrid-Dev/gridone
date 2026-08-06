import { Link, useNavigate } from "react-router";
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
import {
  deviceMeasureReading,
  deviceSetpointReading,
  formatReading,
} from "@/lib/deviceSummary";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { activeFaultSummary } from "@/lib/faults";
import { SEVERITY_TEXT_CLASS } from "@/lib/severity";
import { cn } from "@/lib/utils";
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
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const status = getConnectionStatus(device);
  const Icon = deviceTypeIcon(device.type) ?? Cpu;

  return (
    <TableRow
      onClick={() => navigate(`/devices/${device.id}`)}
      className="cursor-pointer"
    >
      <TableCell className="py-2.5">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <Link
            to={`/devices/${device.id}`}
            className="font-medium hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {device.name}
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
      <TableCell className="py-2.5">
        <span className="flex items-center gap-2">
          <ConnectionStatusDot status={status} />
          <ConnectionStatusValue status={status} />
        </span>
      </TableCell>
      <TableCell className="py-2.5">
        <FaultsCell device={device} />
      </TableCell>
    </TableRow>
  );
}

/** Count of active faults at the device's highest active severity
 *  ("1 alerte"); lower-severity faults are visible on the detail page. */
function FaultsCell({ device }: { device: Device }) {
  const { t } = useTranslation();
  const summary = activeFaultSummary(device);
  if (!summary) return <EmptyValue />;
  return (
    <span className={cn("font-medium", SEVERITY_TEXT_CLASS[summary.severity])}>
      {t(`common.severityCount.${summary.severity}`, { count: summary.count })}
    </span>
  );
}
