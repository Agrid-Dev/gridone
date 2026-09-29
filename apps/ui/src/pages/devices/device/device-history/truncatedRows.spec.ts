import { describe, expect, it } from "vitest";
import type { DataPoint } from "@gridone/sdk";
import { mergeTimeSeries } from "@/lib/mergeTimeSeries";
import { cutAfterLastPoint } from "./truncatedRows";

const at = (minute: number) => new Date(2026, 7, 5, 10, minute).toISOString();
const points: Record<string, DataPoint[]> = {
  temperature: [
    { timestamp: at(0), value: 20 },
    { timestamp: at(2), value: 21 },
  ],
  mode: [
    { timestamp: at(1), value: "heat" },
    { timestamp: at(5), value: "cool" },
  ],
};
const rows = () => mergeTimeSeries(points, ["temperature", "mode"]);

describe("cutAfterLastPoint", () => {
  it("leaves the rows alone when nothing was truncated", () => {
    expect(cutAfterLastPoint(rows(), points, [])).toEqual(rows());
  });

  it("stops a truncated attribute at its last fetched point", () => {
    const cut = cutAfterLastPoint(rows(), points, ["temperature"]);
    // Up to its last point the attribute reads as fetched...
    expect(cut.map((r) => r.values.temperature)).toEqual([20, 20, 21, null]);
    // ...and nothing changes there afterwards.
    expect(cut[3].isNew.temperature).toBe(false);
    // The other attribute keeps its forward-fill.
    expect(cut.map((r) => r.values.mode)).toEqual([
      null,
      "heat",
      "heat",
      "cool",
    ]);
  });

  it("ignores a truncated attribute with no point at all", () => {
    expect(cutAfterLastPoint(rows(), points, ["humidity"])).toEqual(rows());
  });
});
