import type { DataPoint } from "@gridone/sdk";
import type { MergedRow } from "@/lib/mergeTimeSeries";

/**
 * Stops each truncated attribute at its last fetched point.
 *
 * The API cuts a series short from the start of the window, so a truncated
 * attribute's points end well before the window does. Forward-filling past
 * that point would carry its last value to the window's end as if the
 * device had held it. Past the last point the attribute reads as unknown
 * instead: null in every later row, and never a change there.
 */
export function cutAfterLastPoint(
  rows: MergedRow[],
  pointsByMetric: Record<string, DataPoint[]>,
  truncated: readonly string[],
): MergedRow[] {
  const cutoffs = truncated.flatMap((name) => {
    const points = pointsByMetric[name];
    if (!points || points.length === 0) return [];
    const last = Math.max(
      ...points.map((p) => new Date(p.timestamp).getTime()),
    );
    return [[name, last] as const];
  });
  if (cutoffs.length === 0) return rows;
  return rows.map((row) => {
    const at = new Date(row.timestamp).getTime();
    const cut = cutoffs.filter(([, last]) => at > last);
    if (cut.length === 0) return row;
    const values = { ...row.values };
    const isNew = { ...row.isNew };
    const commandIds = { ...row.commandIds };
    for (const [name] of cut) {
      values[name] = null;
      isNew[name] = false;
      commandIds[name] = undefined;
    }
    return { ...row, values, isNew, commandIds };
  });
}
