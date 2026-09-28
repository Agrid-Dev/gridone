import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import { getFleetGlyph } from "./registry";

vi.mock("react-i18next", () =>
  createI18nMock({
    "thermostat.name": "Thermostat",
    "ahu_double_flux.name": "Double-flux AHU",
    "ahu_single_flux.name": "Single-flux AHU",
    "air_extractor.name": "Air extractor",
    "awhp.name": "Heat pump",
    "pump.name": "Pump",
    "electricity_meter.name": "Electricity meter",
    "weather_sensor.name": "Weather sensor",
    "liquid_detector.name": "Leak detector",
    "pms_monitor.name": "PMS monitor",
    "other.name": "Other",
  }),
);

function device(type: string | null, attributes: Record<string, unknown>) {
  return {
    id: "d1",
    name: "Device",
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: false,
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([name, value]) => [
        name,
        { name, kind: "standard", current_value: value },
      ]),
    ),
  } as unknown as Device;
}

function renderGlyph(type: string | null, attributes = {}) {
  const Glyph = getFleetGlyph(type);
  render(<Glyph device={device(type, attributes)} />);
}

afterEach(cleanup);

describe("fleet glyphs", () => {
  it.each([
    [DeviceType.Thermostat, "Thermostat"],
    [DeviceType.AhuDoubleFlux, "Double-flux AHU"],
    [DeviceType.AhuSingleFlux, "Single-flux AHU"],
    [DeviceType.AirExtractor, "Air extractor"],
    [DeviceType.Awhp, "Heat pump"],
    [DeviceType.Pump, "Pump"],
    [DeviceType.ElectricityMeter, "Electricity meter"],
    [DeviceType.WeatherSensor, "Weather sensor"],
    [DeviceType.LiquidDetector, "Leak detector"],
    [DeviceType.PmsMonitor, "PMS monitor"],
  ])("names the %s glyph after its type", (type, name) => {
    renderGlyph(type);
    expect(screen.getByRole("img", { name })).toBeInTheDocument();
  });

  it.each([
    ["an untyped device", null, "Other"],
    ["an unknown type", "vendor_box", "vendor_box"],
  ])("falls back to the neutral chip for %s", (_, type, name) => {
    renderGlyph(type);
    expect(screen.getByRole("img", { name })).toHaveAttribute(
      "data-state",
      "other",
    );
  });

  it.each([
    // Thermostat: mode + on/off, since its bounds are unknown.
    [
      DeviceType.Thermostat,
      { onoff_state: true, mode: "heat" },
      "running:heat",
    ],
    [
      DeviceType.Thermostat,
      { onoff_state: true, mode: "cool" },
      "running:cool",
    ],
    [DeviceType.Thermostat, { onoff_state: false, mode: "heat" }, "stopped"],
    [DeviceType.Thermostat, { mode: "auto" }, "running:auto"],
    [DeviceType.Thermostat, {}, "unknown"],
    // Units with an on/off switch.
    // Air handlers: the coil takes the battery that is open; hvac_mode only
    // when no valve is reported.
    [
      DeviceType.AhuDoubleFlux,
      { onoff_state: true, hvac_mode: "cool" },
      "running:cool",
    ],
    [
      DeviceType.AhuDoubleFlux,
      {
        onoff_state: true,
        hvac_mode: "cool",
        heating_valve: 40,
        cooling_valve: 0,
      },
      "running:heat",
    ],
    [
      DeviceType.AhuSingleFlux,
      { onoff_state: true, heating_valve: 0, cooling_valve: 65 },
      "running:cool",
    ],
    [
      DeviceType.AhuSingleFlux,
      {
        onoff_state: true,
        hvac_mode: "heat",
        heating_valve: 0,
        cooling_valve: 0,
      },
      "running",
    ],
    [
      DeviceType.AhuSingleFlux,
      { onoff_state: false, hvac_mode: "heat" },
      "stopped",
    ],
    [DeviceType.AirExtractor, { onoff_state: true }, "running"],
    [DeviceType.AirExtractor, {}, "unknown"],
    [DeviceType.Awhp, { onoff_state: false }, "stopped"],
    [DeviceType.Pump, { onoff_state: true }, "running"],
    [DeviceType.Pump, {}, "unknown"],
    // Types whose glyph is their reading.
    [DeviceType.ElectricityMeter, { active_power: 240 }, "reporting"],
    [DeviceType.ElectricityMeter, {}, "unknown"],
    [DeviceType.WeatherSensor, { weather_code: 63 }, "code:63"],
    [DeviceType.WeatherSensor, {}, "unknown"],
    [DeviceType.LiquidDetector, { liquid_detected: true }, "detected"],
    [DeviceType.LiquidDetector, { liquid_detected: false }, "dry"],
    [DeviceType.PmsMonitor, { reservation_status: "booked" }, "booked"],
    [DeviceType.PmsMonitor, {}, "unknown"],
  ])("draws %s %j as %s", (type, attributes, state) => {
    renderGlyph(type, attributes);
    expect(screen.getByRole("img")).toHaveAttribute("data-state", state);
  });

  it("never animates — a grid of spinning glyphs says nothing", () => {
    const Glyph = getFleetGlyph(DeviceType.Pump);
    const { container } = render(
      <Glyph device={device(DeviceType.Pump, { onoff_state: true })} />,
    );
    expect(container.querySelector("animateTransform")).toBeNull();
  });
});
