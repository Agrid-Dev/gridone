import type { CellValue, MergedRow } from "@/lib/mergeTimeSeries";

export type HistoryEventKind = "numeric" | "state";

/** One recorded value change, in long format — the unit of the events table. */
export type HistoryEvent = {
  timestamp: string;
  metric: string;
  kind: HistoryEventKind;
  value: CellValue;
  previousValue: CellValue;
  commandId?: number;
};

/**
 * Flatten merged rows into one event per recorded value change, newest first.
 *
 * Only cells flagged `isNew` produce an event — forward-filled cells (and the
 * synthetic hold-to-end row appended for charts, whose `isNew` map is empty)
 * are skipped. Within a timestamp, the numeric metric comes before the state
 * metrics, matching the argument order.
 */
export function buildHistoryEvents(
  rows: MergedRow[],
  numericMetric: string | null,
  stateMetrics: string[],
): HistoryEvent[] {
  const metrics: { name: string; kind: HistoryEventKind }[] = [
    ...(numericMetric
      ? [{ name: numericMetric, kind: "numeric" as const }]
      : []),
    ...stateMetrics.map((name) => ({ name, kind: "state" as const })),
  ];

  const events: HistoryEvent[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    for (const { name, kind } of metrics) {
      if (!row.isNew[name]) continue;
      events.push({
        timestamp: row.timestamp,
        metric: name,
        kind,
        value: row.values[name],
        previousValue: row.previousValues[name],
        commandId: row.commandIds[name],
      });
    }
  }
  return events;
}

/** Bucket for the two-line timestamp cell: relative day labels for the two
 *  most recent days, an absolute date otherwise. */
export function eventDayKind(
  date: Date,
  now: Date,
): "today" | "yesterday" | "date" {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = startOfDay(now) - startOfDay(date);
  if (diff === 0) return "today";
  if (diff === dayMs) return "yesterday";
  return "date";
}
