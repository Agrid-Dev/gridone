import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Cpu } from "lucide-react";
import type { Driver } from "@gridone/sdk";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui/table";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { EmptyValue } from "@/components/EmptyValue";
import { deviceTypeIcon } from "@/lib/deviceTypes";

/** The driver catalog: one row per driver, with the device family it serves,
 *  its transport protocol and how many attributes it exposes. */
export function DriversTable({ drivers }: { drivers: Driver[] }) {
  const { t } = useTranslation("drivers");

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <Th>{t("table.driver")}</Th>
            <Th>{t("table.type")}</Th>
            <Th>{t("table.protocol")}</Th>
            <Th className="text-right">{t("table.attributes")}</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drivers.map((driver) => (
            <DriverRow key={driver.id} driver={driver} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** One driver of the catalog. The whole row navigates to the driver detail;
 *  the id stays a real link for accessibility. */
function DriverRow({ driver }: { driver: Driver }) {
  const { t } = useTranslation("transports");
  const navigate = useNavigate();
  const to = `/drivers/${driver.id}`;

  return (
    <TableRow onClick={() => navigate(to)} className="cursor-pointer">
      <TableCell className="py-2.5">
        <span className="flex items-center gap-2.5">
          <DriverIcon driver={driver} />
          <Link
            to={to}
            className="text-sm font-medium hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {driver.id}
          </Link>
        </span>
      </TableCell>
      <TableCell className="py-2.5">
        {driver.type ? <DeviceTypeChip type={driver.type} /> : <EmptyValue />}
      </TableCell>
      <TableCell className="py-2.5">
        <Badge variant="info" className="text-[11px] font-medium">
          {t(`protocols.${driver.transport}`, {
            defaultValue: driver.transport,
          })}
        </Badge>
      </TableCell>
      <TableCell className="py-2.5 text-right tabular-nums">
        {driver.attributes.length}
      </TableCell>
    </TableRow>
  );
}

/** The vendor artwork when the driver ships one, otherwise the icon of the
 *  device family it drives. `image_src` is an arbitrary external URL, so an
 *  image that fails to load falls back to the icon too — tracking the failing
 *  URL rather than a flag lets the artwork come back if the driver is
 *  repointed at a working one. */
function DriverIcon({ driver }: { driver: Driver }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = driver.image_src;

  if (src && failedSrc !== src) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted p-1.5">
        <img
          src={src}
          alt=""
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  const Icon = deviceTypeIcon(driver.type) ?? Cpu;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
