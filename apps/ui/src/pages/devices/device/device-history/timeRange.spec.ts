import { describe, it, expect } from "vitest";
import {
  resolveTimeRange,
  rangeLabel,
  parseRangeParams,
  writeRangeParams,
  DEFAULT_PRESET,
  type TimeRange,
} from "./timeRange";

const NOW = new Date("2026-02-25T12:00:00Z").getTime();

describe("resolveTimeRange", () => {
  it.each([
    ["10m", 10 * 60_000],
    ["30m", 30 * 60_000],
    ["1h", 60 * 60_000],
    ["3h", 3 * 60 * 60_000],
    ["12h", 12 * 60 * 60_000],
    ["1d", 24 * 60 * 60_000],
    ["7d", 7 * 24 * 60 * 60_000],
  ] as const)("preset %s produces a start %d ms before now", (preset, ms) => {
    const { start, end } = resolveTimeRange({ kind: "preset", preset }, NOW);
    expect(start).toBe(new Date(NOW - ms).toISOString());
    expect(end).toBeUndefined();
  });

  it("preset 'all' returns undefined start and end", () => {
    const { start, end } = resolveTimeRange(
      { kind: "preset", preset: "all" },
      NOW,
    );
    expect(start).toBeUndefined();
    expect(end).toBeUndefined();
  });

  it("custom range passes through start and end", () => {
    const { start, end } = resolveTimeRange({
      kind: "custom",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-31T23:59:59Z",
    });
    expect(start).toBe("2026-01-01T00:00:00Z");
    expect(end).toBe("2026-01-31T23:59:59Z");
  });

  it("custom range with empty strings returns undefined", () => {
    const { start, end } = resolveTimeRange({
      kind: "custom",
      start: "",
      end: "",
    });
    expect(start).toBeUndefined();
    expect(end).toBeUndefined();
  });
});

describe("rangeLabel", () => {
  const t = ((key: string, opts?: { count?: number }) => {
    if (key === "deviceDetails.rangeAll") return "All time";
    if (key === "deviceDetails.rangeCustom") return "Custom range";
    if (key === "deviceDetails.rangeLastMinutes")
      return `Last ${opts?.count} min`;
    if (key === "deviceDetails.rangeLastHours") return `Last ${opts?.count}h`;
    if (key === "deviceDetails.rangeLastDays") return `Last ${opts?.count}d`;
    return key;
  }) as Parameters<typeof rangeLabel>[1];

  it("returns preset label", () => {
    expect(rangeLabel({ kind: "preset", preset: "3h" }, t)).toBe("Last 3h");
  });

  it("returns 'All time' for all preset", () => {
    expect(rangeLabel({ kind: "preset", preset: "all" }, t)).toBe("All time");
  });

  it("returns 'Custom range' for custom kind", () => {
    expect(rangeLabel({ kind: "custom", start: "a", end: "b" }, t)).toBe(
      "Custom range",
    );
  });
});

describe("parseRangeParams / writeRangeParams round-trip", () => {
  it("defaults to DEFAULT_PRESET when no params", () => {
    const result = parseRangeParams(new URLSearchParams());
    expect(result).toEqual({ kind: "preset", preset: DEFAULT_PRESET });
  });

  it("parses a valid preset", () => {
    const params = new URLSearchParams("range=1d");
    expect(parseRangeParams(params)).toEqual({
      kind: "preset",
      preset: "1d",
    });
  });

  it("parses 'all' preset", () => {
    const params = new URLSearchParams("range=all");
    expect(parseRangeParams(params)).toEqual({
      kind: "preset",
      preset: "all",
    });
  });

  it("parses custom from/to", () => {
    const params = new URLSearchParams(
      "from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z",
    );
    expect(parseRangeParams(params)).toEqual({
      kind: "custom",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-31T23:59:59Z",
    });
  });

  it("ignores invalid preset and falls back to default", () => {
    const params = new URLSearchParams("range=invalid");
    expect(parseRangeParams(params)).toEqual({
      kind: "preset",
      preset: DEFAULT_PRESET,
    });
  });

  it("round-trips a preset through write → parse", () => {
    const range: TimeRange = { kind: "preset", preset: "7d" };
    const written = writeRangeParams(new URLSearchParams(), range);
    expect(parseRangeParams(written)).toEqual(range);
  });

  it("round-trips a custom range through write → parse", () => {
    const range: TimeRange = {
      kind: "custom",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-31T23:59:59Z",
    };
    const written = writeRangeParams(new URLSearchParams(), range);
    expect(parseRangeParams(written)).toEqual(range);
  });

  it("round-trips the default preset (no params written)", () => {
    const range: TimeRange = { kind: "preset", preset: DEFAULT_PRESET };
    const written = writeRangeParams(new URLSearchParams(), range);
    // Default preset produces no range param
    expect(written.has("range")).toBe(false);
    expect(parseRangeParams(written)).toEqual(range);
  });

  it("writeRangeParams preserves unrelated params", () => {
    const base = new URLSearchParams("page=3&foo=bar");
    const written = writeRangeParams(base, {
      kind: "preset",
      preset: "1h",
    });
    expect(written.get("page")).toBe("3");
    expect(written.get("foo")).toBe("bar");
    expect(written.get("range")).toBe("1h");
  });
});
