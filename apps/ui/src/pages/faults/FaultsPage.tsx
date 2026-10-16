import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { usePermissions } from "@/contexts/AuthContext";
import { FaultsHeader, FAULT_HISTORY_PATH } from "./components/FaultsHeader";
import { FaultsTable } from "./components/FaultsTable";
import { SeveritySummaryCard } from "./components/SeveritySummaryCard";
import { useFaultsPage, type FaultRow } from "./useFaultsPage";
import { useRecurrenceNotes } from "./useRecurrenceNotes";
import { SEVERITIES } from "@/lib/severity";

/** Summary cards read worst-first, like the table underneath. */
const SUMMARY_ORDER = [...SEVERITIES].reverse();

export default function FaultsPage() {
  const { t } = useTranslation(["faults", "common"]);
  const {
    rows,
    counts,
    loading,
    error,
    exportCsv,
    severity: selectedSeverity,
    setSeverity,
    total,
  } = useFaultsPage();
  const notes = useRecurrenceNotes();

  const header = (
    <FaultsHeader
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

  if (total === 0 && !selectedSeverity) {
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
            active={selectedSeverity === severity}
            onClick={() => setSeverity(severity)}
            label={t(`faults.summary.${severity}`, {
              count: counts[severity],
            })}
          />
        ))}
      </div>

      {rows.length ? (
        <FaultsTable
          rows={rows}
          notes={notes}
          footer={<OngoingFooter rows={rows} />}
        />
      ) : (
        <ResourceEmpty
          resourceName={t("common:common.fault")}
          filtered
          showCreate={false}
          title={t("faults.filteredEmpty")}
          clearLabel={t("faults.clearFilter")}
          onClearFilters={() => setSeverity()}
        />
      )}
    </section>
  );
}

/** "3 alertes en cours sur 2 appareils · Voir l'historique". */
function OngoingFooter({ rows }: { rows: FaultRow[] }) {
  const { t } = useTranslation("faults");
  const can = usePermissions();
  const devices = new Set(rows.map((row) => row.device_id)).size;
  return (
    <>
      {t("faults.liveFooter.alerts", { count: rows.length })}{" "}
      {t("faults.liveFooter.devices", { count: devices })}
      {can("timeseries:read") && (
        <>
          {" · "}
          <Link
            to={FAULT_HISTORY_PATH}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("faults.liveFooter.seeHistory")}
          </Link>
        </>
      )}
    </>
  );
}
