import { describe, expect, it } from "vitest";
import { DeviceType } from "@/lib/devices";
import { standardControlTypes } from "./registry";

describe("standardControlTypes", () => {
  it("offers the types that register a control", () => {
    expect(standardControlTypes()).toContain(DeviceType.Thermostat);
  });

  it("leaves out read-only types, which have no control to render", () => {
    expect(standardControlTypes()).not.toContain(DeviceType.PmsMonitor);
  });
});
