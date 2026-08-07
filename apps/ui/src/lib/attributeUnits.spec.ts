import { describe, expect, it } from "vitest";
import { attributeUnit, commonAttributeUnit } from "./attributeUnits";

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

  it.each([
    ["humidity", "%"],
    ["active_power", "W"],
  ])("knows %s exactly", (name, expected) => {
    expect(attributeUnit(name)).toBe(expected);
  });

  it.each([
    ["pressure", "the scale is driver-defined"],
    ["energy", "Wh or kWh is not knowable"],
    ["fan_speed", "a percentage on one device, an enum on another"],
    ["temperatures_count", "not a temperature reading"],
  ])("leaves %s unitless (%s)", (name) => {
    expect(attributeUnit(name)).toBeNull();
  });
});

describe("commonAttributeUnit", () => {
  it("returns the unit every attribute agrees on", () => {
    expect(commonAttributeUnit(["temperature", "temperature_setpoint"])).toBe(
      "°",
    );
  });

  it("returns null when the attributes disagree", () => {
    expect(commonAttributeUnit(["temperature", "humidity"])).toBeNull();
  });

  it("returns null as soon as one attribute is unitless", () => {
    expect(commonAttributeUnit(["temperature", "pressure"])).toBeNull();
  });

  it("returns null for no attributes at all", () => {
    expect(commonAttributeUnit([])).toBeNull();
  });
});
