import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deviceTypeBucketLabel,
  deviceTypeKeyIcon,
  type DeviceTypeGroup,
} from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";
import { DeviceRow } from "./DeviceRow";

type DevicesTableProps = {
  groups: DeviceTypeGroup[];
  assetNameOf: (device: Device) => string | null;
};

/** The fleet table: one full-width group-header row per type bucket, then a
 *  {@link DeviceRow} per device. */
export function DevicesTable({ groups, assetNameOf }: DevicesTableProps) {
  const { t } = useTranslation("devices");
  const { t: tTypes } = useTranslation("standardDevices");

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <Th>{t("devices.table.device")}</Th>
            <Th>{t("devices.table.zone")}</Th>
            <Th className="text-right">{t("devices.table.measure")}</Th>
            <Th className="text-right">{t("devices.table.setpoint")}</Th>
            <Th>{t("devices.table.mode")}</Th>
            <Th>{t("devices.table.connection")}</Th>
            <Th>{t("devices.table.faults")}</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const Icon = deviceTypeKeyIcon(group.key);
            return (
              <Fragment key={group.key}>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={7} className="py-2">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {deviceTypeBucketLabel(group.key, tTypes)}
                      <span className="tabular-nums">
                        {group.devices.length}
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
                {group.devices.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    zoneName={assetNameOf(device)}
                  />
                ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn("h-10 text-xs uppercase tracking-wider", className)}
    >
      {children}
    </TableHead>
  );
}
