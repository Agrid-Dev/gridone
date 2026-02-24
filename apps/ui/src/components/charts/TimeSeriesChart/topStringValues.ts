import { MAX_STRING_VALUES } from "./constants";

/**
 * Compute the top-N string values ranked by total duration.
 *
 * Duration for a value at index `i` is `timestamps[i+1] - timestamps[i]`
 * (last index gets duration 0). When unique values exceed MAX_STRING_VALUES,
 * only the top-N by total duration are returned and `hasOther` is set.
 */
export function computeTopStringValues(
  values: (string | null)[],
  timestamps: Date[],
): {
  displayValues: string[];
  hasOther: boolean;
  topSet: Set<string>;
} {
  // Collect unique values in first-seen order and accumulate durations
  const order: string[] = [];
  const durations = new Map<string, number>();

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;

    if (!durations.has(v)) {
      order.push(v);
      durations.set(v, 0);
    }

    const dur =
      i < timestamps.length - 1
        ? timestamps[i + 1].getTime() - timestamps[i].getTime()
        : 0;
    durations.set(v, durations.get(v)! + dur);
  }

  if (order.length <= MAX_STRING_VALUES) {
    return {
      displayValues: order,
      hasOther: false,
      topSet: new Set(order),
    };
  }

  // Sort by total duration descending, take top N
  const sorted = [...order].sort(
    (a, b) => durations.get(b)! - durations.get(a)!,
  );
  const top = sorted.slice(0, MAX_STRING_VALUES);
  const topSet = new Set(top);

  return { displayValues: top, hasOther: true, topSet };
}
