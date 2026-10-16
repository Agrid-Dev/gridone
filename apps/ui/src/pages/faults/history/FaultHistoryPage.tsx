import { useTranslation } from "react-i18next";
import { Download, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { segmentItemClass } from "@/components/TimeRangeSegments";
import { FaultsHeader } from "../components/FaultsHeader";
import { EpisodesByDay } from "./EpisodesByDay";
import { EpisodesByDevice } from "./EpisodesByDevice";
import { HistoryFigureTiles } from "./HistoryFigureTiles";
import { HistoryFilters } from "./HistoryFilters";
import {
  type FaultHistory,
  type HistoryView,
  useFaultHistory,
} from "./useFaultHistory";

const VIEWS: { view: HistoryView; labelKey: string }[] = [
  { view: "day", labelKey: "faults.history.views.byDay" },
  { view: "device", labelKey: "faults.history.views.byDevice" },
];

/** Alerts › Historique: every alert of a period, ended or ongoing, rebuilt
 *  from the devices' recorded history, day by day or by device. */
export default function FaultHistoryPage() {
  const { t } = useTranslation("faults");
  const history = useFaultHistory();

  return (
    <section className="space-y-6">
      <FaultsHeader
        caption={t("faults.history.caption")}
        actions={
          history.rows.length > 0 && (
            <Button variant="outline" onClick={history.exportCsv}>
              <Download className="h-4 w-4" />
              {t("faults.export")}
            </Button>
          )
        }
        aside={<ViewSwitch view={history.view} onChange={history.setView} />}
      />
      <HistoryFilters history={history} />
      <HistoryContent history={history} />
    </section>
  );
}

function HistoryContent({ history }: { history: FaultHistory }) {
  const { t } = useTranslation(["faults", "common"]);
  const { loading, error, allRows, rows, figures, truncated, view } = history;

  if (loading) {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-[6.5rem] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </>
    );
  }

  if (error) {
    return <ErrorFallback title={t("faults.history.unableToLoad")} />;
  }

  if (allRows.length === 0) {
    return (
      <ResourceEmpty
        resourceName={t("common:common.fault").toLowerCase()}
        showCreate={false}
        title={t("faults.history.emptyTitle")}
        description={t("faults.history.emptyDescription")}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <ResourceEmpty
        resourceName={t("common:common.fault")}
        filtered
        showCreate={false}
        title={t("faults.history.filteredEmpty")}
        clearLabel={t("faults.history.clearFilters")}
        onClearFilters={history.clearFilters}
      />
    );
  }

  return (
    <>
      {truncated && (
        <p
          role="status"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-status-warning"
        >
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          {t("faults.history.truncated")}
        </p>
      )}
      {figures && (
        <HistoryFigureTiles
          figures={figures}
          span={history.span}
          labelOf={history.labelOf}
        />
      )}
      {view === "device" ? (
        <EpisodesByDevice history={history} />
      ) : (
        <EpisodesByDay history={history} />
      )}
    </>
  );
}

/** "Afficher : Chronologie | Par appareil", at the end of the tab row. */
function ViewSwitch({
  view,
  onChange,
}: {
  view: HistoryView;
  onChange: (view: HistoryView) => void;
}) {
  const { t } = useTranslation("faults");
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground" aria-hidden>
        {t("faults.history.views.label")}
      </span>
      <div
        role="group"
        aria-label={t("faults.history.views.label")}
        className="inline-flex items-center rounded-md bg-muted p-1"
      >
        {VIEWS.map(({ view: value, labelKey }) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => onChange(value)}
            className={segmentItemClass(view === value)}
          >
            {t(labelKey as "faults.history.views.byDay")}
          </button>
        ))}
      </div>
    </div>
  );
}
