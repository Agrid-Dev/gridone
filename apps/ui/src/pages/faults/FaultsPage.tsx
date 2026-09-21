import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { FaultsTable } from "./components/FaultsTable";
import { SeveritySummaryCard } from "./components/SeveritySummaryCard";
import { useFaultsPage } from "./useFaultsPage";
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
        <FaultsTable rows={rows} />
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
