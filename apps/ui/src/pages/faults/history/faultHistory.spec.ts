import { describe, expect, it } from "vitest";
import { inTimeZone } from "@/test/timeZone";
import {
  countByAlert,
  durationWithin,
  episodeDuration,
  groupByDay,
  historyFigures,
  summarizeByAlert,
  type EpisodeRow,
} from "./faultHistory";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NOW = Date.parse("2026-10-14T14:40:00Z");
const PERIOD = { start: NOW - 7 * DAY, end: NOW };

function episode({
  device = "room-203",
  attribute = "window_open",
  start,
  end = null,
}: {
  device?: string;
  attribute?: string;
  start: string;
  end?: string | null;
}): EpisodeRow {
  return {
    device_id: device,
    device_name: device,
    device_type: "thermostat",
    attribute_name: attribute,
    data_type: "bool",
    severity: "warning",
    value: true,
    started_at: start,
    ended_at: end,
    zone: null,
    startMs: Date.parse(start),
    endMs: end === null ? null : Date.parse(end),
  };
}

describe("countByAlert", () => {
  it("counts the episodes of each alert of each device", () => {
    const counts = countByAlert([
      episode({ start: "2026-10-14T13:30:00Z" }),
      episode({ start: "2026-10-14T07:12:00Z", end: "2026-10-14T07:58:00Z" }),
      episode({ device: "pump", start: "2026-10-14T09:15:00Z" }),
      episode({ attribute: "fault_code", start: "2026-10-13T09:15:00Z" }),
    ]);
    expect(Object.fromEntries(counts)).toEqual({
      "room-203:window_open": 2,
      "pump:window_open": 1,
      "room-203:fault_code": 1,
    });
  });
});

describe("episodeDuration", () => {
  it("measures a closed episode from its start to its end", () => {
    const row = episode({
      start: "2026-10-14T07:12:00Z",
      end: "2026-10-14T07:58:00Z",
    });
    expect(episodeDuration(row, NOW)).toBe(46 * MINUTE);
  });

  it("measures an ongoing episode up to now", () => {
    const row = episode({ start: "2026-10-14T13:30:00Z" });
    expect(episodeDuration(row, NOW)).toBe(70 * MINUTE);
  });
});

describe("durationWithin", () => {
  it("counts only the part of an episode inside the period", () => {
    const row = episode({ start: "2026-05-17T08:00:00Z" });
    expect(durationWithin(row, PERIOD, NOW)).toBe(7 * DAY);
  });

  it("counts nothing for an episode that ended before the period", () => {
    const row = episode({
      start: "2026-10-01T08:00:00Z",
      end: "2026-10-01T09:00:00Z",
    });
    expect(durationWithin(row, PERIOD, NOW)).toBe(0);
  });
});

describe("groupByDay", () => {
  // Martinique is UTC-4: 03:00 UTC on the 14th is still the 13th there.
  inTimeZone("America/Martinique");

  it("groups episodes by the local day they opened on, newest first", () => {
    const groups = groupByDay([
      episode({ start: "2026-10-13T20:00:00Z", end: "2026-10-13T20:30:00Z" }),
      episode({ start: "2026-10-14T13:30:00Z" }),
      episode({ start: "2026-10-14T03:00:00Z", end: "2026-10-14T03:20:00Z" }),
    ]);
    expect(
      groups.map(({ day, rows }) => [
        day.getDate(),
        rows.map((row) => row.started_at),
      ]),
    ).toEqual([
      [14, ["2026-10-14T13:30:00Z"]],
      [13, ["2026-10-14T03:00:00Z", "2026-10-13T20:00:00Z"]],
    ]);
  });
});

describe("summarizeByAlert", () => {
  it("sums each alert of each device, the longest in alert first", () => {
    const summaries = summarizeByAlert(
      [
        episode({
          device: "pump",
          attribute: "fault_code",
          start: "2026-10-14T09:15:00Z",
          end: "2026-10-14T09:23:00Z",
        }),
        episode({ start: "2026-10-14T13:30:00Z" }),
        episode({ start: "2026-10-14T07:12:00Z", end: "2026-10-14T07:58:00Z" }),
        episode({ start: "2026-10-13T16:47:00Z", end: "2026-10-13T17:10:00Z" }),
        // Opened an hour before the period: only its last 30 minutes count.
        episode({
          device: "pump",
          attribute: "fault_code",
          start: "2026-10-07T13:40:00Z",
          end: "2026-10-07T15:10:00Z",
        }),
      ],
      PERIOD,
      NOW,
    );
    expect(
      summaries.map(({ key, count, totalMs, ongoing, latest }) => ({
        key,
        count,
        minutes: totalMs / MINUTE,
        ongoing,
        latest: latest.started_at,
      })),
    ).toEqual([
      {
        key: "room-203:window_open",
        count: 3,
        minutes: 70 + 46 + 23,
        ongoing: true,
        latest: "2026-10-14T13:30:00Z",
      },
      {
        key: "pump:fault_code",
        count: 2,
        minutes: 8 + 30,
        ongoing: false,
        latest: "2026-10-14T09:15:00Z",
      },
    ]);
  });
});

describe("historyFigures", () => {
  it("counts the episodes, those still on, and the time spent in alert", () => {
    const figures = figuresFor(
      [
        episode({ start: "2026-10-14T13:30:00Z" }),
        episode({ start: "2026-10-14T07:12:00Z", end: "2026-10-14T07:58:00Z" }),
        episode({
          device: "pump",
          start: "2026-10-14T09:15:00Z",
          end: "2026-10-14T09:23:00Z",
        }),
      ],
      PERIOD,
      NOW,
    );
    expect(figures.count).toBe(3);
    expect(figures.ongoing).toBe(1);
    expect(figures.totalMs).toBe((70 + 46 + 8) * MINUTE);
    expect(figures.mostFrequent?.key).toBe("room-203:window_open");
  });

  it("gives a tie in frequency to the alert that lasted longer", () => {
    const figures = figuresFor(
      [
        episode({
          device: "a",
          start: "2026-10-14T07:00:00Z",
          end: "2026-10-14T07:05:00Z",
        }),
        episode({
          device: "a",
          start: "2026-10-14T08:00:00Z",
          end: "2026-10-14T08:05:00Z",
        }),
        episode({
          device: "b",
          start: "2026-10-14T09:00:00Z",
          end: "2026-10-14T10:00:00Z",
        }),
        episode({
          device: "b",
          start: "2026-10-14T11:00:00Z",
          end: "2026-10-14T12:00:00Z",
        }),
      ],
      PERIOD,
      NOW,
    );
    expect(figures.mostFrequent?.key).toBe("b:window_open");
  });

  it("has no most frequent alert over an empty period", () => {
    expect(figuresFor([], PERIOD, NOW)).toEqual({
      count: 0,
      ongoing: 0,
      totalMs: 0,
      mostFrequent: null,
    });
  });
});

function figuresFor(
  rows: EpisodeRow[],
  period: { start: number; end: number },
  now: number,
) {
  return historyFigures(rows, summarizeByAlert(rows, period, now));
}
