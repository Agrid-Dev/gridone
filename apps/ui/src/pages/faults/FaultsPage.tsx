import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { SeverityLabel } from "./components/SeverityLabel";
import { SeveritySummaryCard } from "./components/SeveritySummaryCard";
import { faultKey, useFaultsPage, type FaultRow } from "./useFaultsPage";
import { faultLabel } from "@/lib/faultLabel";
import { SEVERITIES } from "@/lib/severity";
import { cn, formatDurationSince } from "@/lib/utils";

/** Summary cards read worst-first, like the table underneath. */
const SUMMARY_ORDER = [...SEVERITIES].reverse();

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
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>{t("faults.columns.device")}</TableHead>
              <TableHead>{t("faults.columns.zone")}</TableHead>
              <TableHead>{t("faults.columns.fault")}</TableHead>
              <TableHead>{t("faults.columns.severity")}</TableHead>
              <TableHead>{t("faults.columns.activeSince")}</TableHead>
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
      <TableCell className="font-medium">
        <Link
          to={`/devices/${row.device_id}`}
          className="text-primary hover:underline"
        >
          {row.device_name}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {row.zone ?? <span aria-hidden>—</span>}
      </TableCell>
      <TableCell>{label}</TableCell>
      <TableCell>
        <SeverityLabel severity={row.severity} />
      </TableCell>
      <TableCell className="text-sm tabular-nums text-muted-foreground">
        {activeSince}
      </TableCell>
    </TableRow>
  );
}
