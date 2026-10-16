import type { FaultEpisode } from "@gridone/sdk";
import { faultKey } from "../useFaultsPage";

/** An episode as the history lists it: joined with the zone its device sits
 *  in, its bounds read once as epoch milliseconds. */
export type EpisodeRow = FaultEpisode & {
  zone: string | null;
  assetId?: string;
  startMs: number;
  /** Null while the episode is ongoing. */
  endMs: number | null;
};

/** The period the history covers, in epoch milliseconds. */
export type Period = { start: number; end: number };

/** How many episodes each alert of each device had, keyed by
 *  {@link faultKey}: how often it came back. */
export function countByAlert(
  episodes: readonly Pick<FaultEpisode, "device_id" | "attribute_name">[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const episode of episodes) {
    const key = faultKey(episode);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** How long an episode lasted, or has lasted until `now` while ongoing. */
export function episodeDuration(row: EpisodeRow, now: number): number {
  return (row.endMs ?? now) - row.startMs;
}

/** The time an episode spent inside `period`: what it adds to the time spent
 *  in alert over that period, however long before it the episode opened. */
export function durationWithin(
  row: EpisodeRow,
  period: Period,
  now: number,
): number {
  const end = Math.min(row.endMs ?? now, period.end);
  return Math.max(0, end - Math.max(row.startMs, period.start));
}

export type DayGroup = { day: Date; rows: EpisodeRow[] };

/** The episodes by the local day they opened on, newest day first and newest
 *  episode first within a day. */
export function groupByDay(rows: EpisodeRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of [...rows].sort((a, b) => b.startMs - a.startMs)) {
    const opened = new Date(row.startMs);
    const day = new Date(
      opened.getFullYear(),
      opened.getMonth(),
      opened.getDate(),
    );
    const last = groups.at(-1);
    if (last?.day.getTime() === day.getTime()) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}

/** One alert of one device over the period. */
export type AlertSummary = {
  key: string;
  /** Its most recent episode. */
  latest: EpisodeRow;
  count: number;
  /** Time spent in alert inside the period. */
  totalMs: number;
  ongoing: boolean;
};

/** One line per alert of each device, the longest in alert first. */
export function summarizeByAlert(
  rows: EpisodeRow[],
  period: Period,
  now: number,
): AlertSummary[] {
  const byKey = new Map<string, AlertSummary>();
  for (const row of rows) {
    const key = faultKey(row);
    const within = durationWithin(row, period, now);
    const summary = byKey.get(key);
    if (!summary) {
      byKey.set(key, {
        key,
        latest: row,
        count: 1,
        totalMs: within,
        ongoing: row.endMs === null,
      });
      continue;
    }
    summary.count += 1;
    summary.totalMs += within;
    summary.ongoing ||= row.endMs === null;
    if (row.startMs > summary.latest.startMs) summary.latest = row;
  }
  return [...byKey.values()].sort((a, b) => b.totalMs - a.totalMs);
}

/** The three figures heading the history. */
export type HistoryFigures = {
  count: number;
  ongoing: number;
  /** Time spent in alert inside the period, all devices together. */
  totalMs: number;
  /** The alert that came back most often; null over an empty period. */
  mostFrequent: AlertSummary | null;
};

export function historyFigures(
  rows: EpisodeRow[],
  period: Period,
  now: number,
): HistoryFigures {
  const summaries = summarizeByAlert(rows, period, now);
  // Summaries arrive longest in alert first and the sort is stable, so a tie
  // in frequency goes to the alert that lasted longer.
  const [mostFrequent = null] = [...summaries].sort(
    (a, b) => b.count - a.count,
  );
  return {
    count: rows.length,
    ongoing: rows.filter((row) => row.endMs === null).length,
    totalMs: summaries.reduce((sum, summary) => sum + summary.totalMs, 0),
    mostFrequent,
  };
}
