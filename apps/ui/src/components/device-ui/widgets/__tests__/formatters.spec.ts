import { describe, expect, it } from "vitest";
import {
  formatDeviation,
  formatMeasurement,
  formatNumber,
  formatRelativeTime,
  toTimestamp,
} from "../formatters";

describe("formatNumber", () => {
  it.each<[number, number | undefined, string, string]>([
    [21.4, 1, "en", "21.4"],
    [21.4, 1, "fr", "21,4"],
    [21, 1, "en", "21.0"],
    [21.456, undefined, "en", "21.46"],
    [12345.5, 0, "fr", "12346"],
  ])(
    "%s with %s decimals in %s → %s",
    (value, decimals, language, expected) => {
      expect(formatNumber(value, decimals, language)).toBe(expected);
    },
  );
});

describe("toTimestamp", () => {
  it.each<[string | number | boolean, number | null]>([
    ["2026-09-09T10:00:00Z", Date.UTC(2026, 8, 9, 10)],
    [1_788_948_000, 1_788_948_000_000],
    [1_788_948_000_000, 1_788_948_000_000],
    ["not a date", null],
    [true, null],
  ])("%s → %s", (value, expected) => {
    expect(toTimestamp(value)).toBe(expected);
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 8, 9, 16, 0);
  it.each<[string, string, string]>([
    ["2026-09-09T15:55:00Z", "en", "5 minutes ago"],
    ["2026-09-09T10:10:00Z", "en", "5 hours ago"],
    ["2026-09-09T10:10:00Z", "fr", "il y a 5 heures"],
    ["2026-09-06T10:10:00Z", "en", "3 days ago"],
  ])("%s in %s → %s", (value, language, expected) => {
    expect(formatRelativeTime(value, language, now)).toBe(expected);
  });

  it("is null for a value that is not a timestamp", () => {
    expect(formatRelativeTime("soon", "en", now)).toBeNull();
  });
});

describe("formatMeasurement", () => {
  it("formats numbers with the formatter's or the attribute's unit", () => {
    expect(formatMeasurement(21.4, { decimals: 1 }, "°C", "en")).toBe(
      "21.4 °C",
    );
    expect(
      formatMeasurement(21.4, { decimals: 0, unit: "K" }, "°C", "en"),
    ).toBe("21 K");
    expect(formatMeasurement(44, undefined, null, "en")).toBe("44");
  });

  it("passes strings and booleans through and reports unknown values as null", () => {
    expect(formatMeasurement("heat", undefined, null, "en")).toBe("heat");
    expect(formatMeasurement(true, undefined, null, "en")).toBe("true");
    expect(formatMeasurement(null, undefined, "°C", "en")).toBeNull();
    expect(formatMeasurement(undefined, undefined, "°C", "en")).toBeNull();
  });

  it("formats a timestamp as elapsed time when asked", () => {
    const value = new Date(Date.now() - 2 * 3600_000).toISOString();
    expect(formatMeasurement(value, { relative_time: true }, null, "en")).toBe(
      "2 hours ago",
    );
  });
});

describe("formatDeviation", () => {
  it.each<[number, number | undefined, string | null, string]>([
    [0.4, 1, "°C", "+0.4 °C"],
    [-1.25, 2, null, "-1.25"],
    [0, undefined, "°C", "0.0 °C"],
  ])("%s → %s", (delta, decimals, unit, expected) => {
    expect(formatDeviation(delta, decimals, unit, "en")).toBe(expected);
  });
});
