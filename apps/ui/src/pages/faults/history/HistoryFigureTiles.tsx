import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatCompactDuration } from "@/lib/compactDuration";
import type { HistoryFigures } from "./faultHistory";
import type { FaultHistory } from "./useFaultHistory";

type HistoryFigureTilesProps = {
  figures: HistoryFigures;
  span: FaultHistory["span"];
  labelOf: FaultHistory["labelOf"];
};

/** The three figures heading the history: how many alerts, how long in
 *  alert, and which came back most often. */
export function HistoryFigureTiles({
  figures,
  span,
  labelOf,
}: HistoryFigureTilesProps) {
  const { t } = useTranslation("faults");
  const { t: tCommon } = useTranslation();
  const { mostFrequent } = figures;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Figure
        label={t("faults.history.figures.count", {
          span: t(`faults.span.${span}`),
        })}
        value={figures.count}
        note={
          figures.ongoing > 0
            ? t("faults.history.figures.ongoing", { count: figures.ongoing })
            : t("faults.history.figures.allEnded")
        }
      />
      <Figure
        label={t("faults.history.figures.duration")}
        value={formatCompactDuration(figures.totalMs, tCommon)}
        note={t("faults.history.figures.durationNote")}
      />
      <Figure
        label={t("faults.history.figures.mostFrequent")}
        value={mostFrequent ? labelOf(mostFrequent.latest) : "—"}
        note={
          mostFrequent &&
          t("faults.history.figures.mostFrequentNote", {
            device: mostFrequent.latest.device_name,
            count: mostFrequent.count,
          })
        }
      />
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string | null;
}) {
  return (
    <div
      data-slot="history-figure"
      className="min-w-0 rounded-lg border bg-card p-5 shadow-sm"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate font-display text-2xl font-semibold leading-tight tabular-nums">
        {value}
      </p>
      {note && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
      )}
    </div>
  );
}
