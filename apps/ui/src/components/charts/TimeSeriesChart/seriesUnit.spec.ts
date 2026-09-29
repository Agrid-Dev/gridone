import { describe, expect, it } from "vitest";
import { commonSeriesUnit, groupSeriesByUnit, seriesUnit } from "./seriesUnit";

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

describe("groupSeriesByUnit", () => {
  const units = (series: Parameters<typeof groupSeriesByUnit>[0]) =>
    [...groupSeriesByUnit(series)].map(([unit, group]) => [
      unit,
      group.map((s) => s.key),
    ]);

  it("groups by unit in order of first appearance", () => {
    expect(
      units([
        { key: "temperature", label: "T" },
        { key: "humidity", label: "H" },
        { key: "temperature_setpoint", label: "S" },
      ]),
    ).toEqual([
      ["°", ["temperature", "temperature_setpoint"]],
      ["%", ["humidity"]],
    ]);
  });

  it("folds a convention unit into the one declared unit of its family", () => {
    expect(
      units([
        { key: "temperature", label: "T", unit: "°C" },
        { key: "temperature_setpoint", label: "S" },
      ]),
    ).toEqual([["°C", ["temperature", "temperature_setpoint"]]]);
  });

  it("leaves a convention unit alone when two declared units could claim it", () => {
    expect(
      units([
        { key: "temperature", label: "T", unit: "°C" },
        { key: "outdoor_temperature", label: "O", unit: "°F" },
        { key: "temperature_setpoint", label: "S" },
      ]),
    ).toEqual([
      ["°C", ["temperature"]],
      ["°F", ["outdoor_temperature"]],
      ["°", ["temperature_setpoint"]],
    ]);
  });

  it("keeps unitless series together, apart from any unit", () => {
    expect(
      units([
        { key: "pressure", label: "P" },
        { key: "temperature", label: "T" },
        { key: "energy", label: "E" },
      ]),
    ).toEqual([
      [null, ["pressure", "energy"]],
      ["°", ["temperature"]],
    ]);
  });
});
