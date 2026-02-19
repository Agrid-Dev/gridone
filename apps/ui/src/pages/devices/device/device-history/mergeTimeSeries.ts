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
 * `isNew[attr]` is `true` when the cell holds a real data point and `false`
 * when the value was carried forward from an earlier timestamp.
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

  // 2. Sort unique timestamps descending (newest first)
  const sorted = [...allEpochs].sort((a, b) => b - a);

  // 3. Build rows with raw (sparse) values and isNew flags
  const rows: MergedRow[] = sorted.map((epoch) => {
    const values: Record<string, CellValue> = {};
    const isNew: Record<string, boolean> = {};
    for (const attr of attributes) {
      const lookup = lookups.get(attr)!;
      if (lookup.has(epoch)) {
        values[attr] = lookup.get(epoch)!;
        isNew[attr] = true;
      } else {
        values[attr] = null;
        isNew[attr] = false;
      }
    }
    return { timestamp: new Date(epoch).toISOString(), values, isNew };
  });

  // 4. Forward-fill: walk from oldest (end of array) to newest (start)
  const carry: Record<string, CellValue> = {};
  for (const attr of attributes) carry[attr] = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    for (const attr of attributes) {
      if (rows[i].values[attr] !== null) {
        carry[attr] = rows[i].values[attr];
      } else {
        rows[i].values[attr] = carry[attr];
      }
    }
  }

  return rows;
}
