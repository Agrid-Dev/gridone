import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui/table";
import { type DeviceTypeGroup } from "@/lib/deviceTypes";
import { DeviceGroupHeading } from "./DeviceGroupHeading";
import { DeviceRow } from "./DeviceRow";

type DevicesTableProps = {
  groups: DeviceTypeGroup[];
  assetNameOf: (device: Device) => string | null;
};

/** The fleet table: one full-width group-header row per type bucket, then a
 *  {@link DeviceRow} per device. */
export function DevicesTable({ groups, assetNameOf }: DevicesTableProps) {
  const { t } = useTranslation("devices");

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
          {groups.map((group) => (
            <Fragment key={group.key}>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={7} className="py-2">
                  <DeviceGroupHeading
                    typeKey={group.key}
                    count={group.devices.length}
                  />
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
