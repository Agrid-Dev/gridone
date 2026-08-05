import { describe, expect, it } from "vitest";
import type { MergedRow } from "@/lib/mergeTimeSeries";
import { buildHistoryEvents, eventDayKind } from "./historyEvents";

function mrow(
  tsMs: number,
  {
    values = {},
    isNew = {},
    previousValues = {},
    commandIds = {},
  }: Partial<
    Pick<MergedRow, "values" | "isNew" | "previousValues" | "commandIds">
  > = {},
): MergedRow {
  return {
    timestamp: new Date(tsMs).toISOString(),
    values,
    previousValues,
    commandIds,
    isNew,
  };
}

describe("buildHistoryEvents", () => {
  it("emits one event per changed cell, newest first, numeric before state", () => {
    const rows = [
      mrow(0, {
        values: { temp: 20, mode: "heat" },
        isNew: { temp: true, mode: true },
      }),
      mrow(60_000, {
        values: { temp: 21, mode: "heat" },
        isNew: { temp: true },
      }),
    ];

    const events = buildHistoryEvents(rows, "temp", ["mode"]);

    expect(
      events.map((e) => ({ ts: e.timestamp, metric: e.metric, kind: e.kind })),
    ).toEqual([
      { ts: new Date(60_000).toISOString(), metric: "temp", kind: "numeric" },
      { ts: new Date(0).toISOString(), metric: "temp", kind: "numeric" },
      { ts: new Date(0).toISOString(), metric: "mode", kind: "state" },
    ]);
  });

  it("skips forward-filled cells and the held sentinel row", () => {
    const rows = [
      mrow(0, { values: { temp: 20 }, isNew: { temp: true } }),
      // mode carried forward, no change recorded for temp either
      mrow(60_000, { values: { temp: 20, mode: "auto" }, isNew: {} }),
    ];

    const events = buildHistoryEvents(rows, "temp", ["mode"]);

    expect(events).toHaveLength(1);
    expect(events[0].metric).toBe("temp");
  });

  it("carries the command id and previous value of a change", () => {
    const rows = [
      mrow(0, {
        values: { temp: 21 },
        previousValues: { temp: 20 },
        commandIds: { temp: 7 },
        isNew: { temp: true },
      }),
    ];

    const [event] = buildHistoryEvents(rows, "temp", []);

    expect(event.commandId).toBe(7);
    expect(event.previousValue).toBe(20);
    expect(event.value).toBe(21);
  });

  it("covers only the state series when there is no numeric metric", () => {
    const rows = [
      mrow(0, {
        values: { temp: 20, mode: "heat" },
        isNew: { temp: true, mode: true },
      }),
    ];

    const events = buildHistoryEvents(rows, null, ["mode"]);

    expect(events.map((e) => e.metric)).toEqual(["mode"]);
  });
});

describe("eventDayKind", () => {
  const now = new Date(2026, 7, 5, 14, 30);

  it("buckets the current day as today", () => {
    expect(eventDayKind(new Date(2026, 7, 5, 0, 1), now)).toBe("today");
  });

  it("buckets the previous day as yesterday, across midnight", () => {
    expect(eventDayKind(new Date(2026, 7, 4, 23, 59), now)).toBe("yesterday");
  });

  it("buckets anything older as a date, across month boundaries", () => {
    expect(eventDayKind(new Date(2026, 6, 31), now)).toBe("date");
  });
});
