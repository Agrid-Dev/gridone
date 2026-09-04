import { describe, expect, it } from "vitest";

import { bucketStep } from "./bucketStep";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A gap-filled grid of *count* buckets *step* apart, as an aggregate read
 *  returns it. */
function grid(count: number, step: number): Date[] {
  const start = Date.UTC(2026, 8, 1);
  return Array.from({ length: count }, (_, i) => new Date(start + i * step));
}

describe("bucketStep", () => {
  it("reads the spacing off an even grid", () => {
    expect(bucketStep(grid(24, HOUR))).toBe(HOUR);
  });

  // Months are 28-31 days apart, so no single gap is "the" width and the mean
  // sits between two of them. The middle gap is a real month.
  it("takes a representative month from an uneven month grid", () => {
    const months = [0, 1, 2, 3, 4].map((m) => new Date(Date.UTC(2026, m, 1)));

    const step = bucketStep(months);

    expect(step).toBeGreaterThanOrEqual(28 * DAY);
    expect(step).toBeLessThanOrEqual(31 * DAY);
  });

  // A series missing a bucket leaves one double gap. Averaging would widen
  // every bar to cover it; the median ignores it.
  it("is not dragged out by a missing bucket", () => {
    const withHole = [
      ...grid(3, HOUR),
      new Date(grid(3, HOUR)[2].getTime() + 2 * HOUR),
    ];

    expect(bucketStep(withHole)).toBe(HOUR);
  });

  it("has no spacing to report below two points", () => {
    expect(bucketStep(grid(1, HOUR))).toBeNull();
    expect(bucketStep([])).toBeNull();
  });
});
