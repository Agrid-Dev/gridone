import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyValue } from "@/components/EmptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui/table";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { SeverityLabel } from "./components/SeverityLabel";
import { SeveritySummaryCard } from "./components/SeveritySummaryCard";
import { faultKey, useFaultsPage, type FaultRow } from "./useFaultsPage";
import { faultLabel } from "@/lib/faultLabel";
import { SEVERITIES, type Severity } from "@/lib/severity";
import { cn, formatDurationSince } from "@/lib/utils";

/** Summary cards read worst-first, like the table underneath. */
const SUMMARY_ORDER = [...SEVERITIES].reverse();

/** A slim rail makes every severity visible before the operator reaches the
 * severity column. Alerts also keep their stronger row wash. */
const SEVERITY_RAIL_CLASS: Record<Severity, string> = {
  alert: "border-l-4 border-l-status-error",
  warning: "border-l-4 border-l-status-warning",
  info: "border-l-4 border-l-muted-foreground",
};

export default function FaultsPage() {
  const { t } = useTranslation(["faults", "common"]);
  const { rows, counts, loading, error, exportCsv } = useFaultsPage();

  const header = (
    <ResourceHeader
      title={t("faults.title")}
      caption={t("faults.caption")}
      actions={
        rows.length > 0 && (
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            {t("faults.export")}
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <section className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SUMMARY_ORDER.map((severity) => (
            <Skeleton key={severity} className="h-[5.75rem] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-6">
        {header}
        <ErrorFallback title={t("faults.unableToLoad")} />
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="space-y-6">
        {header}
        <ResourceEmpty
          resourceName={t("common:common.fault").toLowerCase()}
          showCreate={false}
          title={t("faults.emptyTitle")}
          description={t("faults.emptyDescription")}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SUMMARY_ORDER.map((severity) => (
          <SeveritySummaryCard
            key={severity}
            severity={severity}
            count={counts[severity]}
            label={t(`faults.summary.${severity}`, {
              count: counts[severity],
            })}
          />
        ))}
      </div>

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
    </section>
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
