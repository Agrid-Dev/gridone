import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useFaultEpisodes } from "@/hooks/useFaultEpisodes";
import { useFaultLabel } from "@/hooks/useFaultLabel";
import { useTimeRangeUrlState } from "@/hooks/useTimeRangeUrlState";
import { downloadCsv } from "@/lib/csv";
import { deviceTypeName } from "@/lib/deviceTypes";
import { SEVERITIES } from "@/lib/severity";
import { capitalize, foldText } from "@/lib/textFormat";
import { matchesAllWords } from "@/lib/textSearch";
import {
  type TimeRange,
  type TimeRangePreset,
  resolveTimeRange,
} from "@/lib/timeRange";
import { useSeverityParam } from "../useSeverityParam";
import {
  type EpisodeRow,
  episodeDuration,
  groupByDay,
  historyFigures,
  summarizeByAlert,
} from "./faultHistory";

const DEFAULT_PRESET: TimeRangePreset = "7d";

/** The periods prose names ("3 fois sur 7 jours"); any other reads "sur la
 *  période". */
export type HistorySpan = "1d" | "7d" | "1mo" | "custom";

/** The two readings of the history: day by day, or one line per alert. */
export type HistoryView = "day" | "device";

function spanOf(range: TimeRange): HistorySpan {
  if (range.kind !== "preset") return "custom";
  const { preset } = range;
  return preset === "1d" || preset === "7d" || preset === "1mo"
    ? preset
    : "custom";
}

const MINUTE = 60_000;
const minutes = (milliseconds: number) =>
  String(Math.floor(milliseconds / MINUTE));
/** The UTC day of a moment, as the ongoing list's export names its file. */
const isoDay = (milliseconds: number) =>
  new Date(milliseconds).toISOString().slice(0, 10);

/**
 * Everything the alert history renders. The period, severity, search and
 * reading live in the URL (`?last=`, `?severity=`, `?search=`, `?view=`) so
 * a copied link reproduces the view. Episodes are fetched per period only;
 * severity and search filter them here, and every figure, group and line is
 * computed from the episodes on screen, so they always agree.
 */
export function useFaultHistory() {
  const { t } = useTranslation("faults");
  // Severity names and compact durations live in the default namespace.
  const { t: tCommon, i18n } = useTranslation();
  const { t: tTypes } = useTranslation("standardDevices");
  const { timeRange, applyRange, applyPreset } = useTimeRangeUrlState({
    defaultPreset: DEFAULT_PRESET,
    allowAll: false,
  });
  const params = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const { episodes, period, asOf, truncated, loading, error } =
    useFaultEpisodes(params);
  const { assetByDeviceId } = useAssetTree();
  const { severity, setSeverity } = useSeverityParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const view: HistoryView =
    searchParams.get("view") === "device" ? "device" : "day";
  const labelOf = useFaultLabel();
  const typeOf = useCallback(
    (row: EpisodeRow) => deviceTypeName(row.device_type, tTypes),
    [tTypes],
  );

  const allRows = useMemo<EpisodeRow[]>(
    () =>
      episodes.map((episode) => ({
        ...episode,
        zone: assetByDeviceId[episode.device_id]?.name ?? null,
        assetId: assetByDeviceId[episode.device_id]?.id,
        startMs: Date.parse(episode.started_at),
        endMs: episode.ended_at ? Date.parse(episode.ended_at) : null,
      })),
    [episodes, assetByDeviceId],
  );

  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          (!severity || row.severity === severity) &&
          (!search ||
            matchesAllWords(
              foldText(
                [row.device_name, row.zone, labelOf(row), typeOf(row)].join(
                  " ",
                ),
              ),
              search,
            )),
      ),
    [allRows, severity, search, labelOf, typeOf],
  );

  const now = asOf ?? 0;
  const shown = period;
  const days = useMemo(() => groupByDay(rows), [rows]);
  const summaries = useMemo(
    () => (shown ? summarizeByAlert(rows, shown, now) : []),
    [rows, shown, now],
  );
  const recurrences = useMemo(
    () =>
      new Map(
        truncated
          ? []
          : summaries.map((summary) => [summary.key, summary.count]),
      ),
    [summaries, truncated],
  );
  const figures = shown && !truncated ? historyFigures(rows, summaries) : null;
  const most = Math.max(1, ...summaries.map((summary) => summary.count));
  const severityOptions = [...SEVERITIES]
    .reverse()
    .map((value) => ({
      key: value,
      label: capitalize(tCommon(`common.severity.${value}`), i18n.language),
      count: truncated
        ? undefined
        : allRows.filter((row) => row.severity === value).length,
    }))
    .filter(
      (option) =>
        option.count === undefined ||
        option.count > 0 ||
        option.key === severity,
    );

  const setView = (next: HistoryView) =>
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next === "device") updated.set("view", "device");
        else updated.delete("view");
        return updated;
      },
      { replace: true },
    );

  const clearFilters = () =>
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.delete("severity");
        updated.delete("search");
        return updated;
      },
      { replace: true },
    );

  /** The reading on screen, as CSV: one row per episode by day, one per
   *  alert by device. Instants travel raw and durations in whole minutes, so
   *  the file sorts and sums in a spreadsheet. */
  const exportCsv = () => {
    if (!shown || truncated || error) return;
    const columns = [
      t("faults.columns.severity"),
      t("faults.columns.fault"),
      t("faults.columns.device"),
      t("faults.columns.zone"),
    ];
    const cells = (row: EpisodeRow) => [
      tCommon(`common.severity.${row.severity}`),
      labelOf(row),
      row.device_name,
      row.zone ?? "",
    ];
    const [header, body] =
      view === "device"
        ? [
            [
              ...columns,
              t("faults.history.csv.lastTime"),
              t("faults.history.csv.totalMinutes"),
              t("faults.history.csv.count"),
            ],
            summaries.map((summary) => [
              ...cells(summary.latest),
              summary.latest.started_at,
              minutes(summary.totalMs),
              String(summary.count),
            ]),
          ]
        : [
            [
              ...columns,
              t("faults.history.csv.start"),
              t("faults.history.csv.end"),
              t("faults.history.csv.durationMinutes"),
            ],
            days
              .flatMap((day) => day.rows)
              .map((row) => [
                ...cells(row),
                row.started_at,
                row.ended_at ?? "",
                minutes(episodeDuration(row, now)),
              ]),
          ];
    downloadCsv(
      header,
      body,
      `${t("faults.history.exportFilenameStem")}-${isoDay(shown.start)}-${isoDay(shown.end)}.csv`,
    );
  };

  return {
    timeRange,
    applyRange,
    applyPreset,
    span: spanOf(timeRange),
    severity,
    setSeverity,
    view,
    setView,
    clearFilters,
    loading,
    error,
    truncated,
    /** Episodes over the period, before severity and search. */
    allRows,
    rows,
    days,
    summaries,
    most,
    severityOptions,
    figures,
    recurrences,
    now,
    labelOf,
    typeOf,
    exportCsv,
  };
}

export type FaultHistory = ReturnType<typeof useFaultHistory>;
