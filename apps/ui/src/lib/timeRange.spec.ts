import { describe, it, expect } from "vitest";
import {
  resolveTimeRange,
  rangeLabel,
  parseRangeParams,
  writeRangeParams,
  rangeEndsNow,
  hasRangeParams,
  DASHBOARD_PRESET_OPTIONS,
  DEFAULT_PRESET,
  PRESET_OPTIONS,
  type TimeRange,
} from "./timeRange";

describe("preset ladders", () => {
  it("offers dashboards a longer window than device-scoped views", () => {
    const longest = (options: typeof PRESET_OPTIONS) =>
      options[options.length - 1].value;
    expect(longest(PRESET_OPTIONS)).toBe("7d");
    expect(longest(DASHBOARD_PRESET_OPTIONS)).toBe("12mo");
  });

  it("drops the sub-hour presets from the dashboard ladder", () => {
    const values = DASHBOARD_PRESET_OPTIONS.map((o) => o.value);
    expect(values).not.toContain("10m");
    expect(values).not.toContain("30m");
  });
});

describe("hasRangeParams", () => {
  it.each(["last=1d", "start=2026-01-01", "end=2026-01-31"])(
    "is true when the URL carries %s",
    (query) => {
      expect(hasRangeParams(new URLSearchParams(query))).toBe(true);
    },
  );

  it("is false on a bare URL", () => {
    expect(hasRangeParams(new URLSearchParams("page=3"))).toBe(false);
  });
});

describe("resolveTimeRange", () => {
  it.each([
    "10m",
    "30m",
    "1h",
    "3h",
    "12h",
    "1d",
    "7d",
    "1mo",
    "3mo",
    "6mo",
    "12mo",
  ] as const)("preset %s returns { last: preset }", (preset) => {
    const result = resolveTimeRange({ kind: "preset", preset });
    expect(result).toEqual({ last: preset });
  });

  it("preset 'all' returns empty object", () => {
    const result = resolveTimeRange({ kind: "preset", preset: "all" });
    expect(result).toEqual({});
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
    if (key === "timeRange.rangeAll") return "All time";
    if (key === "timeRange.rangeCustom") return "Custom range";
    if (key === "timeRange.rangeLastMinutes") return `Last ${opts?.count} min`;
    if (key === "timeRange.rangeLastHours") return `Last ${opts?.count}h`;
    if (key === "timeRange.rangeLastDays") return `Last ${opts?.count}d`;
    if (key === "timeRange.rangeLastMonths")
      return `Last ${opts?.count} months`;
    return key;
  }) as Parameters<typeof rangeLabel>[1];

  it("returns preset label", () => {
    expect(rangeLabel({ kind: "preset", preset: "3h" }, t)).toBe("Last 3h");
  });

  // A dashboard preset reaching a device-scoped view (shared link, remembered
  // preference) must still read as a label rather than as its raw value.
  it("labels a preset the device-scoped ladder does not offer", () => {
    expect(rangeLabel({ kind: "preset", preset: "3mo" }, t)).toBe(
      "Last 3 months",
    );
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

describe("rangeEndsNow", () => {
  it.each(["10m", "3h", "7d", "all"] as const)(
    "preset %s tracks the present",
    (preset) => {
      expect(rangeEndsNow({ kind: "preset", preset })).toBe(true);
    },
  );

  it("is true for a custom range with an open end", () => {
    expect(rangeEndsNow({ kind: "custom", start: "2026-01-01", end: "" })).toBe(
      true,
    );
  });

  it("is false for a closed custom range", () => {
    expect(
      rangeEndsNow({ kind: "custom", start: "2026-01-01", end: "2026-01-31" }),
    ).toBe(false);
  });
});

describe("parseRangeParams / writeRangeParams round-trip", () => {
  it("defaults to DEFAULT_PRESET when no params", () => {
    const result = parseRangeParams(new URLSearchParams());
    expect(result).toEqual({ kind: "preset", preset: DEFAULT_PRESET });
  });

  it("parses a valid preset from 'last' param", () => {
    const params = new URLSearchParams("last=1d");
    expect(parseRangeParams(params)).toEqual({
      kind: "preset",
      preset: "1d",
    });
  });

  it("parses 'all' preset", () => {
    const params = new URLSearchParams("last=all");
    expect(parseRangeParams(params)).toEqual({
      kind: "preset",
      preset: "all",
    });
  });

  it("parses custom start/end", () => {
    const params = new URLSearchParams(
      "start=2026-01-01T00:00:00Z&end=2026-01-31T23:59:59Z",
    );
    expect(parseRangeParams(params)).toEqual({
      kind: "custom",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-31T23:59:59Z",
    });
  });

  it("ignores invalid preset and falls back to default", () => {
    const params = new URLSearchParams("last=invalid");
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

  it("round-trips 'all' preset through write → parse", () => {
    const range: TimeRange = { kind: "preset", preset: "all" };
    const written = writeRangeParams(new URLSearchParams(), range);
    expect(written.get("last")).toBe("all");
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
    expect(written.has("last")).toBe(false);
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
    expect(written.get("last")).toBe("1h");
  });

  it("writeRangeParams cleans up previous time params", () => {
    const base = new URLSearchParams("last=1d&start=old&end=old");
    const written = writeRangeParams(base, {
      kind: "preset",
      preset: "1h",
    });
    expect(written.get("last")).toBe("1h");
    expect(written.has("start")).toBe(false);
    expect(written.has("end")).toBe(false);
  });
});
