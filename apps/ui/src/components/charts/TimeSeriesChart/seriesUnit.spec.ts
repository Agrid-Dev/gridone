import { describe, expect, it } from "vitest";
import { commonSeriesUnit, seriesUnit } from "./seriesUnit";

describe("seriesUnit", () => {
  it("takes the unit the series declares", () => {
    expect(seriesUnit({ key: "pressure", label: "P", unit: "bar" })).toBe(
      "bar",
    );
  });

  it("prefers the declared unit over the name convention", () => {
    expect(seriesUnit({ key: "temperature", label: "T", unit: "°F" })).toBe(
      "°F",
    );
  });

  it("falls back to the name convention of the attribute", () => {
    expect(seriesUnit({ key: "temperature", label: "T" })).toBe("°");
    expect(seriesUnit({ key: "temperature", label: "T", unit: null })).toBe(
      "°",
    );
  });

  it("reads the attribute off semanticKey when the series is keyed otherwise", () => {
    expect(
      seriesUnit({ key: "device-1", label: "Room", semanticKey: "humidity" }),
    ).toBe("%");
  });

  it("stays null for an attribute with no knowable unit", () => {
    expect(seriesUnit({ key: "pressure", label: "P" })).toBeNull();
  });
});

describe("commonSeriesUnit", () => {
  it("returns the unit every series agrees on", () => {
    expect(
      commonSeriesUnit([
        { key: "temperature", label: "T" },
        { key: "temperature_setpoint", label: "S" },
      ]),
    ).toBe("°");
  });

  it("returns null when the series disagree", () => {
    expect(
      commonSeriesUnit([
        { key: "temperature", label: "T" },
        { key: "humidity", label: "H" },
      ]),
    ).toBeNull();
  });

  it("returns null as soon as one series is unitless", () => {
    expect(
      commonSeriesUnit([
        { key: "temperature", label: "T" },
        { key: "pressure", label: "P" },
      ]),
    ).toBeNull();
  });

  it("returns null for no series at all", () => {
    expect(commonSeriesUnit([])).toBeNull();
  });
});
