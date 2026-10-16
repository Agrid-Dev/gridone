import { ResourceLink as Link } from "@/components/ResourceLink";
import { EmptyValue } from "@/components/EmptyValue";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { devicePath } from "@/pages/devices/device/deviceSections";
import { SEVERITY_RAIL_CLASS } from "../components/FaultsTable";
import { SeverityLabel } from "../components/SeverityLabel";
import type { EpisodeRow } from "./faultHistory";

/** The cells both readings of the history open with, as the ongoing list
 *  draws them: the severity on its rail, the device, its zone. */

export function SeverityCell({ row }: { row: EpisodeRow }) {
  return (
    <TableCell
      className={cn(
        "whitespace-nowrap py-2.5",
        SEVERITY_RAIL_CLASS[row.severity],
      )}
    >
      <SeverityLabel severity={row.severity} />
    </TableCell>
  );
}

export function DeviceCell({
  row,
  type,
}: {
  row: EpisodeRow;
  type: string | undefined;
}) {
  return (
    <TableCell className="py-2.5">
      <Link
        to={devicePath(row.device_id)}
        className="font-medium text-primary hover:underline focus-visible:underline"
      >
        {row.device_name || row.device_id}
      </Link>
      {type && (
        <span className="block text-xs text-muted-foreground">{type}</span>
      )}
    </TableCell>
  );
}

export function ZoneCell({ row }: { row: EpisodeRow }) {
  return (
    <TableCell className="py-2.5 text-muted-foreground">
      {row.assetId ? (
        <Link
          to={`/assets/${row.assetId}`}
          className="text-primary hover:underline focus-visible:underline"
        >
          {row.zone || row.assetId}
        </Link>
      ) : (
        (row.zone ?? <EmptyValue />)
      )}
    </TableCell>
  );
}
