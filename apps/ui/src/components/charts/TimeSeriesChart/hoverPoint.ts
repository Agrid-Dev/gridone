import { MARGIN } from "./constants";

/**
 * The instant under the cursor, read off the x axis.
 *
 * The axis maps the timestamp range linearly across the plot area, so the
 * cursor names a time of its own — not the time of any recorded point. Reading
 * it back is what lets the tooltip report where you are pointing instead of
 * snapping to whichever sample happens to be closest, which reads as a stuck
 * clock on a series with only a handful of points.
 *
 * *domainEnd* overrides where the axis ends, for panels that plot past their
 * last point: bars run one bucket further so the final bucket has width to be
 * drawn in, and a cursor read against the shorter range would name a time
 * drifting ahead of the bar it is over — by a full bucket at the right edge of
 * a short series.
 */
export function timeAtCursor(
  cursorX: number,
  width: number,
  timestamps: Date[],
  domainEnd?: number | null,
): Date | null {
  if (timestamps.length === 0) return null;
  const t0 = timestamps[0].getTime();
  if (timestamps.length === 1) return new Date(t0);
  const chartWidth = width - MARGIN.left - MARGIN.right;
  if (chartWidth <= 0) return null;
  const t1 = domainEnd ?? timestamps[timestamps.length - 1].getTime();
  const fraction = (cursorX - MARGIN.left) / chartWidth;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return new Date(t0 + clamped * (t1 - t0));
}

/**
 * Index of the last point recorded at or before *time*, or `null` when *time*
 * precedes every point.
 *
 * A point is only written when the value changes, so the value in force at any
 * instant is the one most recently recorded — never the nearest one. Between a
 * reading at 14:00 and the next at 18:00, the value at 17:59 is still the 14:00
 * reading, even though 18:00 is closer.
 */
export function indexAtOrBefore(timestamps: Date[], time: Date): number | null {
  if (timestamps.length === 0) return null;
  const target = time.getTime();
  if (timestamps[0].getTime() > target) return null;
  // Binary search for the rightmost timestamp at or before the target.
  let lo = 0;
  let hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timestamps[mid].getTime() <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
