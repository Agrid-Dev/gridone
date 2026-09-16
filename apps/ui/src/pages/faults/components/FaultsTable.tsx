import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { EmptyValue } from "@/components/EmptyValue";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui/table";
import { faultLabel } from "@/lib/faultLabel";
import type { Severity } from "@/lib/severity";
import { cn, formatDurationSince } from "@/lib/utils";
import { SeverityLabel } from "./SeverityLabel";
import { faultKey, type FaultRow } from "../useFaultsPage";

/** A slim rail makes every severity visible before the operator reaches the
 * severity column. Alerts also keep their stronger row wash. */
const SEVERITY_RAIL_CLASS: Record<Severity, string> = {
  alert: "border-l-4 border-l-status-error",
  warning: "border-l-4 border-l-status-warning",
  info: "border-l-4 border-l-muted-foreground",
};

/** The fault rows as the faults page lists them, for every surface that
 *  shows a list of faults: the fleet page and a synoptic's own devices. */
export function FaultsTable({ rows }: { rows: FaultRow[] }) {
  const { t } = useTranslation("faults");
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="min-w-[52rem] table-fixed">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[22%]" />
          <col className="w-[27%]" />
          <col className="w-[15%]" />
          <col className="w-[12%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <Th>{t("faults.columns.device")}</Th>
            <Th>{t("faults.columns.zone")}</Th>
            <Th>{t("faults.columns.fault")}</Th>
            <Th>{t("faults.columns.severity")}</Th>
            <Th>{t("faults.columns.activeSince")}</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <FaultTableRow key={faultKey(row)} row={row} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FaultTableRow({ row }: { row: FaultRow }) {
  const { t } = useTranslation();
  const label = faultLabel({
    name: row.attribute_name,
    data_type: row.data_type,
    current_value: row.current_value,
  });
  const activeSince = formatDurationSince(Date.parse(row.last_changed), t);

  return (
    <TableRow
      // Alerts carry a wash of their severity colour so the rows demanding
      // action are findable without reading the severity column.
      className={cn(
        row.severity === "alert" &&
          "bg-status-error/5 hover:bg-status-error/10",
      )}
    >
      <TableCell
        className={cn("py-2.5 font-medium", SEVERITY_RAIL_CLASS[row.severity])}
      >
        <Link
          to={`/devices/${row.device_id}`}
          className="text-foreground hover:underline"
        >
          {row.device_name}
        </Link>
      </TableCell>
      <TableCell className="py-2.5 text-muted-foreground">
        {row.zone ?? <EmptyValue />}
      </TableCell>
      <TableCell className="py-2.5">{label}</TableCell>
      <TableCell className="whitespace-nowrap py-2.5">
        <SeverityLabel severity={row.severity} />
      </TableCell>
      <TableCell className="whitespace-nowrap py-2.5 text-sm tabular-nums text-muted-foreground">
        {activeSince}
      </TableCell>
    </TableRow>
  );
}
