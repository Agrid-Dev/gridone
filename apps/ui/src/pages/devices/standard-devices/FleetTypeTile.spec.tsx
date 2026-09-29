import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import { FleetTypeTile } from "./FleetTypeTile";

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

const device = (type: string | null) => ({ id: "d1", type }) as Device;

afterEach(cleanup);

describe("FleetTypeTile", () => {
  it.each([
    [DeviceType.Thermostat, "Thermostat", "lucide-gridone-thermostat"],
    [
      DeviceType.AhuDoubleFlux,
      "Double-flux AHU",
      "lucide-gridone-air-handler-double-flow",
    ],
    [
      DeviceType.AhuSingleFlux,
      "Single-flux AHU",
      "lucide-gridone-air-handler-single-flow",
    ],
    [DeviceType.AirExtractor, "Air extractor", "lucide-gridone-air-extractor"],
    [DeviceType.Awhp, "Heat pump", "lucide-gridone-heat-pump"],
    [DeviceType.Pump, "Pump", "lucide-gridone-pump"],
    [
      DeviceType.ElectricityMeter,
      "Electricity meter",
      "lucide-gridone-electricity-meter",
    ],
    [
      DeviceType.WeatherSensor,
      "Weather sensor",
      "lucide-gridone-weather-sensor",
    ],
    [
      DeviceType.LiquidDetector,
      "Leak detector",
      "lucide-gridone-liquid-detector",
    ],
    [DeviceType.PmsMonitor, "PMS monitor", "lucide-gridone-pms-monitor"],
  ])(
    "names the %s tile after its type and draws its pictogram",
    (type, name, icon) => {
      render(<FleetTypeTile device={device(type)} activity="active" />);
      const tile = screen.getByRole("img", { name });
      expect(tile.querySelector("svg")).toHaveClass(icon);
    },
  );

  it.each([
    ["an untyped device", null, "Other"],
    ["an unknown type", "vendor_box", "vendor_box"],
  ])("falls back to the neutral chip for %s", (_, type, name) => {
    render(<FleetTypeTile device={device(type)} activity="unknown" />);
    const tile = screen.getByRole("img", { name });
    expect(tile.querySelector("svg")).toHaveClass("lucide-cpu");
  });

  it.each([
    ["active", "text-foreground", false],
    ["idle", "text-muted-foreground/70", false],
    ["unknown", "text-muted-foreground/50", true],
  ] as const)(
    "draws an %s device in %s, dashed: %s",
    (activity, tone, dashed) => {
      render(
        <FleetTypeTile device={device(DeviceType.Pump)} activity={activity} />,
      );
      const tile = screen.getByRole("img", { name: "Pump" });
      expect(tile).toHaveAttribute("data-activity", activity);
      expect(tile.querySelector("svg")).toHaveClass(tone);
      if (dashed) expect(tile).toHaveClass("border-dashed");
      else expect(tile).not.toHaveClass("border-dashed");
    },
  );

  it("hides the pictogram from assistive tech — the tile carries the name", () => {
    render(
      <FleetTypeTile device={device(DeviceType.Pump)} activity="active" />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
