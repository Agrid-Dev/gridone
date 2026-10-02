import { describe, expect, it } from "vitest";
import { attributeUnit, unitSuffix } from "./attributeUnits";

describe("attributeUnit", () => {
  it.each([
    "temperature",
    "temperature_setpoint",
    "outlet_temperature",
    "supply_air_temperature_setpoint",
    "outdoor_temperature",
  ])("reads %s as a temperature", (name) => {
    expect(attributeUnit(name)).toBe("°");
  });

  it("knows humidity exactly", () => {
    expect(attributeUnit("humidity")).toBe("%");
  });

  it.each(["heating_valve", "supply_fan_speed", "exchanger_utilization"])(
    "reads %s as a ratio in percent",
    (name) => {
      expect(attributeUnit(name)).toBe("%");
    },
  );

  it.each([
    ["pressure", "the scale is driver-defined"],
    ["energy", "Wh or kWh is not knowable"],
    ["active_power", "W or kW is not knowable"],
    ["fan_speed", "a percentage on one device, an enum on another"],
    ["temperatures_count", "not a temperature reading"],
  ])("leaves %s unitless (%s)", (name) => {
    expect(attributeUnit(name)).toBeNull();
  });
});

describe("attributeUnit with driver metadata", () => {
  it("prefers the unit the driver declares over the name convention", () => {
    expect(attributeUnit("pressure", { unit: "bar" })).toBe("bar");
    expect(attributeUnit("temperature", { unit: "°C" })).toBe("°C");
  });

  it("keeps the convention when no unit is declared", () => {
    expect(attributeUnit("temperature", { unit: null })).toBe("°");
    expect(attributeUnit("temperature", undefined)).toBe("°");
  });
});

describe("unitSuffix", () => {
  it.each([
    ["°", "°"],
    ["°C", " °C"],
    ["%", " %"],
    [null, ""],
    [undefined, ""],
  ])("spaces %s as %j", (unit, suffix) => {
    expect(unitSuffix(unit)).toBe(suffix);
  });
});
