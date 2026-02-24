import { MARGIN } from "./constants";

/** Find the index in `timestamps` nearest to the cursor pixel position. */
export function nearestIndex(
  cursorX: number,
  width: number,
  timestamps: Date[],
): number | null {
  if (timestamps.length === 0) return null;
  if (timestamps.length === 1) return 0;
  const chartWidth = width - MARGIN.left - MARGIN.right;
  if (chartWidth <= 0) return null;
  const fraction = (cursorX - MARGIN.left) / chartWidth;
  const t0 = timestamps[0].getTime();
  const t1 = timestamps[timestamps.length - 1].getTime();
  const target = t0 + fraction * (t1 - t0);
  // Binary search for nearest
  let lo = 0;
  let hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid].getTime() < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const dPrev = Math.abs(timestamps[lo - 1].getTime() - target);
    const dCurr = Math.abs(timestamps[lo].getTime() - target);
    if (dPrev < dCurr) return lo - 1;
  }
  return lo;
}
