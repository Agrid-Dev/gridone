import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Cpu } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { TableCell, TableRow } from "@/components/ui/table";
import { AttributeValue } from "@/components/AttributeValue";
import {
  ConnectionStatusDot,
  ConnectionStatusValue,
} from "@/components/ConnectionStatusBadge";
import { getConnectionStatus, type DeviceType } from "@/lib/devices";
import { deviceMeasure, deviceMode, deviceSetpoint } from "@/lib/deviceSummary";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { getActiveFaults } from "@/lib/faults";
import { SEVERITY_TEXT_CLASS } from "@/lib/severity";
import { cn } from "@/lib/utils";

const Dash = () => <span className="text-muted-foreground">—</span>;

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
  const status = getConnectionStatus(device);
  const Icon = deviceTypeIcon(device.type) ?? Cpu;

  return (
    <TableRow
      onClick={() => navigate(`/devices/${device.id}`)}
      className="cursor-pointer"
    >
      <TableCell className="py-2.5">
        <span className="flex items-center gap-2.5">
          <Icon
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
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
        {zoneName ?? <Dash />}
      </TableCell>
      <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums">
        {deviceMeasure(device)}
      </TableCell>
      <TableCell className="py-2.5 text-right font-mono text-sm tabular-nums text-muted-foreground">
        {deviceSetpoint(device)}
      </TableCell>
      <TableCell className="py-2.5">
        <ModeCell device={device} />
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

function ModeCell({ device }: { device: Device }) {
  const { t } = useTranslation();
  const mode = deviceMode(device);
  if (!mode) return <Dash />;
  if (mode.kind === "onoff") {
    return (
      <span className={cn(mode.value === "off" && "text-muted-foreground")}>
        {t(`common.hvacMode.${mode.value}`)}
      </span>
    );
  }
  return (
    <AttributeValue
      attributeName={mode.attribute}
      deviceType={device.type as DeviceType}
      value={mode.value}
    />
  );
}

/** Count of active faults at the device's highest active severity
 *  ("1 alerte"); lower-severity faults are visible on the detail page. */
function FaultsCell({ device }: { device: Device }) {
  const { t } = useTranslation();
  const faults = getActiveFaults(device);
  if (faults.length === 0) return <Dash />;
  const severity = faults[0].severity;
  const count = faults.filter((fault) => fault.severity === severity).length;
  return (
    <span className={cn("font-medium", SEVERITY_TEXT_CLASS[severity])}>
      {t(`common.severityCount.${severity}`, { count })}
    </span>
  );
}
