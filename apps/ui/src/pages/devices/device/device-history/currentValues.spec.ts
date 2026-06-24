import { describe, it, expect } from "vitest";
import { appendCurrentValues } from "./currentValues";
import { mergeTimeSeries } from "./mergeTimeSeries";
import type { DataPoint } from "@/api/timeseries";

const point = (ts: string, value: string | number | boolean): DataPoint => ({
  timestamp: ts,
  value,
});

describe("appendCurrentValues", () => {
  it("appends the current value as the newest point", () => {
    const result = appendCurrentValues(
      {
        connectionStatus: [
          point("2024-01-01T00:00:00.000Z", "ok"),
          point("2024-01-01T00:01:00.000Z", "ok"),
        ],
      },
      {
        connectionStatus: {
          value: "degraded",
          timestamp: "2024-01-01T00:02:00.000Z",
        },
      },
    );

    expect(result.connectionStatus).toHaveLength(3);
    expect(result.connectionStatus[2]).toEqual({
      timestamp: "2024-01-01T00:02:00.000Z",
      value: "degraded",
    });
  });

  it("skips attributes with a null current value", () => {
    const result = appendCurrentValues(
      { temperature: [point("2024-01-01T00:00:00.000Z", 20)] },
      { temperature: { value: null, timestamp: "2024-01-01T00:02:00.000Z" } },
    );

    expect(result.temperature).toHaveLength(1);
  });

  it("skips attributes with no current value entry", () => {
    const result = appendCurrentValues(
      { temperature: [point("2024-01-01T00:00:00.000Z", 20)] },
      { temperature: undefined, humidity: null },
    );

    expect(result.temperature).toHaveLength(1);
    expect(result.humidity).toBeUndefined();
  });

  it("seeds a point for an attribute with no recorded series", () => {
    const result = appendCurrentValues(
      {},
      { battery: { value: 95, timestamp: "2024-01-01T00:00:00.000Z" } },
    );

    expect(result.battery).toEqual([
      { timestamp: "2024-01-01T00:00:00.000Z", value: 95 },
    ]);
  });

  it("does not mutate the input", () => {
    const input = { temperature: [point("2024-01-01T00:00:00.000Z", 20)] };
    appendCurrentValues(input, {
      temperature: { value: 22, timestamp: "2024-01-01T00:01:00.000Z" },
    });

    expect(input.temperature).toHaveLength(1);
  });

  it("makes the merged chart tail reflect the live value", () => {
    // Reproduces the reported bug: last recorded sample is "ok" but the device
    // is now "degraded". The merged tail must carry the live value.
    const augmented = appendCurrentValues(
      {
        connectionStatus: [
          point("2024-01-01T00:00:00.000Z", "degraded"),
          point("2024-01-01T00:01:00.000Z", "ok"),
        ],
      },
      {
        connectionStatus: {
          value: "degraded",
          timestamp: "2024-01-01T00:02:00.000Z",
        },
      },
    );

    const rows = mergeTimeSeries(augmented, ["connectionStatus"]);
    expect(rows.at(-1)?.values.connectionStatus).toBe("degraded");
  });
});
