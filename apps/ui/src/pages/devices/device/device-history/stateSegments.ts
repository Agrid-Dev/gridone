import type { MergedRow } from "@/lib/mergeTimeSeries";

/** Distinct values shown per timeline; the rest is folded into "other". */
export const MAX_TIMELINE_VALUES = 6;

/** Sentinel share entry grouping the values beyond {@link MAX_TIMELINE_VALUES}. */
export const OTHER_VALUE = "__other__";

export type StateSegment = {
  /** Held value over [startMs, endMs); null while the series had no data. */
  value: string | null;
  startMs: number;
  endMs: number;
};

export type StateShare = {
  value: string;
  ms: number;
  /** Rounded share of the observed (non-null) time, in percent. */
  pct: number;
};

export type StateSegmentsResult = {
  segments: StateSegment[];
  /** Time-weighted shares, largest first; may end with an OTHER_VALUE entry. */
  shares: StateShare[];
};

/**
 * Build the state-timeline geometry for one categorical attribute: contiguous
 * runs of equal values as segments, and duration-weighted shares per value.
 *
 * Rows are the chart rows (ascending, last row held to the window end so the
 * final run has real width). A value's duration is the time until the next
 * row, so shares weight by time held rather than by sample count — the same
 * semantics as the chart's top-values ranking. Null runs (before the series
 * first recorded) become null segments, excluded from the shares.
 */
export function computeStateSegments(
  rows: MergedRow[],
  attr: string,
): StateSegmentsResult {
  const segments: StateSegment[] = [];
  const durations = new Map<string, number>();
  const order: string[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const raw = rows[i].values[attr];
    const value = raw == null ? null : String(raw);
    const startMs = new Date(rows[i].timestamp).getTime();
    const endMs = new Date(rows[i + 1].timestamp).getTime();
    if (endMs <= startMs) continue;

    const last = segments[segments.length - 1];
    if (last && last.value === value) {
      last.endMs = endMs;
    } else {
      segments.push({ value, startMs, endMs });
    }

    if (value !== null) {
      if (!durations.has(value)) {
        order.push(value);
        durations.set(value, 0);
      }
      durations.set(value, durations.get(value)! + (endMs - startMs));
    }
  }

  const totalMs = [...durations.values()].reduce((a, b) => a + b, 0);
  if (totalMs === 0) return { segments, shares: [] };

  const ranked = [...order].sort(
    (a, b) => durations.get(b)! - durations.get(a)!,
  );
  const top = ranked.slice(0, MAX_TIMELINE_VALUES);
  const otherMs = ranked
    .slice(MAX_TIMELINE_VALUES)
    .reduce((sum, v) => sum + durations.get(v)!, 0);

  const shares: StateShare[] = top.map((value) => ({
    value,
    ms: durations.get(value)!,
    pct: Math.round((durations.get(value)! / totalMs) * 100),
  }));
  if (otherMs > 0) {
    shares.push({
      value: OTHER_VALUE,
      ms: otherMs,
      pct: Math.round((otherMs / totalMs) * 100),
    });
  }

  return { segments, shares };
}
