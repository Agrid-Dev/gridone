import { describe, expect, it } from "vitest";
import type { AwhpAttributes } from "@/lib/devices";
import { isRunning, sensorAttribute, synopticMode } from "../synopticModel";

const ATTRIBUTES: AwhpAttributes = {
  onoffState: true,
  unitRunStatus: "running",
  mode: "heat",
  inletTemperature: 40.2,
  outletTemperature: 45.1,
  setpointTemperature: 45,
  outdoorTemperature: 7.4,
  compressorSuctionTemperature: 2.1,
  compressorSuctionPressure: 7.6,
  compressorDischargeTemperature: 71.8,
  compressorDischargePressure: 29.4,
  condenserSaturatedRefrigerantTemperature: 48.3,
  condenserRefrigerantPressure: 29.4,
  evaporatorSaturatedRefrigerantTemperature: -2.9,
  evaporatorRefrigerantPressure: 7.6,
};

describe("synopticMode", () => {
  it("draws heating only when the plate exchanger condenses", () => {
    expect(synopticMode("heat")).toBe("heat");
    expect(synopticMode("cool")).toBe("cool");
    expect(synopticMode("auto")).toBe("cool");
    expect(synopticMode(null)).toBe("cool");
  });
});

describe("sensorAttribute", () => {
  it("reads the exchanger pressures by the side each exchanger plays", () => {
    expect(sensorAttribute("air_p", "heat")).toBe(
      "evaporatorRefrigerantPressure",
    );
    expect(sensorAttribute("water_p", "heat")).toBe(
      "condenserRefrigerantPressure",
    );
    expect(sensorAttribute("air_p", "cool")).toBe(
      "condenserRefrigerantPressure",
    );
    expect(sensorAttribute("water_p", "cool")).toBe(
      "evaporatorRefrigerantPressure",
    );
  });

  it("maps the fixed sensors to their attribute", () => {
    expect(sensorAttribute("suction_t", "heat")).toBe(
      "compressorSuctionTemperature",
    );
    expect(sensorAttribute("discharge_p", "cool")).toBe(
      "compressorDischargePressure",
    );
    expect(sensorAttribute("inlet_t", "heat")).toBe("inletTemperature");
  });
});

describe("isRunning", () => {
  it("runs when on, unless the unit reports standby or alarm", () => {
    expect(isRunning(ATTRIBUTES)).toBe(true);
    expect(isRunning({ ...ATTRIBUTES, onoffState: false })).toBe(false);
    expect(isRunning({ ...ATTRIBUTES, unitRunStatus: "Standby" })).toBe(false);
    expect(isRunning({ ...ATTRIBUTES, unitRunStatus: "alarm" })).toBe(false);
    expect(isRunning({ ...ATTRIBUTES, unitRunStatus: null })).toBe(true);
  });
});
