/**
 * The width of one bucket, in milliseconds, read off an aggregated series'
 * own timestamps.
 *
 * Aggregated reads come back gap-filled — a complete, evenly spaced grid over
 * the window, empty buckets carrying a null value — so the spacing between
 * consecutive points *is* the bucket width, and nothing has to tell the chart
 * which interval was asked for.
 *
 * The median is taken rather than the first gap or the average: `1mo` buckets
 * are 28-31 days apart, and a series that lost a bucket somewhere has one
 * double-width gap. Both would skew a mean; neither moves the middle.
 *
 * Returns null for fewer than two points, where no spacing exists to read.
 */
export function bucketStep(timestamps: Date[]): number | null {
  if (timestamps.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    gaps.push(timestamps[i].getTime() - timestamps[i - 1].getTime());
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median > 0 ? median : null;
}
