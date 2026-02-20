import type { DataPoint } from "@/api/timeseries";

export type CellValue = string | number | boolean | null;

export type MergedRow = {
  timestamp: string;
  values: Record<string, CellValue>;
  isNew: Record<string, boolean>;
};

const DEFAULT_PRECISION_MS = 1000;

/**
 * Merge multiple time-series into a single table with forward-fill.
 *
 * Returns rows sorted ascending (oldest first).
 *
 * `isNew[attr]` is `true` when the cell value differs from the
 * chronologically previous row (i.e. an actual value change occurred).
 * Computed after forward-fill.
 */
export function mergeTimeSeries(
  pointsByMetric: Record<string, DataPoint[]>,
  attributes: string[],
  precisionMs: number = DEFAULT_PRECISION_MS,
): MergedRow[] {
  if (attributes.length === 0) return [];

  // 1. Build per-attribute lookup: roundedEpoch → value
  //    When two points round to the same epoch, keep the later original.
  const lookups = new Map<string, Map<number, CellValue>>();
  const allEpochs = new Set<number>();

  for (const attr of attributes) {
    const map = new Map<number, { original: number; value: CellValue }>();
    for (const point of pointsByMetric[attr] ?? []) {
      const original = new Date(point.timestamp).getTime();
      const rounded = Math.floor(original / precisionMs) * precisionMs;
      const existing = map.get(rounded);
      if (!existing || original > existing.original) {
        map.set(rounded, { original, value: point.value });
      }
      allEpochs.add(rounded);
    }
    lookups.set(
      attr,
      new Map([...map.entries()].map(([k, v]) => [k, v.value])),
    );
  }

  if (allEpochs.size === 0) return [];

  // 2. Sort unique timestamps ascending (oldest first)
  const sorted = [...allEpochs].sort((a, b) => a - b);

  // 3. Build rows with raw (sparse) values
  const rows: MergedRow[] = sorted.map((epoch) => {
    const values: Record<string, CellValue> = {};
    const isNew: Record<string, boolean> = {};
    for (const attr of attributes) {
      const lookup = lookups.get(attr)!;
      values[attr] = lookup.has(epoch) ? lookup.get(epoch)! : null;
      isNew[attr] = false; // placeholder, computed in step 5
    }
    return { timestamp: new Date(epoch).toISOString(), values, isNew };
  });

  // 4. Forward-fill: walk from oldest (start) to newest (end)
  const carry: Record<string, CellValue> = {};
  for (const attr of attributes) carry[attr] = null;

  for (let i = 0; i < rows.length; i++) {
    for (const attr of attributes) {
      if (rows[i].values[attr] !== null) {
        carry[attr] = rows[i].values[attr];
      } else {
        rows[i].values[attr] = carry[attr];
      }
    }
  }

  // 5. Compute isNew: true when the value differs from the chronologically
  //    previous (older) row. Rows are sorted ascending, so row[i-1] is older.
  for (let i = 0; i < rows.length; i++) {
    for (const attr of attributes) {
      if (i === 0) {
        // Oldest row: new if the value is not null (first occurrence)
        rows[i].isNew[attr] = rows[i].values[attr] !== null;
      } else {
        rows[i].isNew[attr] = rows[i].values[attr] !== rows[i - 1].values[attr];
      }
    }
  }

  return rows;
}
