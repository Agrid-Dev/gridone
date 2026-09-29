import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { DeviceType } from "@/lib/devices";
import type { FleetActivity } from "./fleet-status";
import { FleetTypeTile } from "./FleetTypeTile";

/** The tile a device of `type` gets in `activity`. */
function renderTile(type: string | null, activity: FleetActivity) {
  const { container } = render(
    <FleetTypeTile device={{ id: "d1", type } as Device} activity={activity} />,
  );
  return container.querySelector("[data-activity]") as HTMLElement;
}

afterEach(cleanup);

describe("FleetTypeTile", () => {
  it.each([
    [DeviceType.Thermostat, "lucide-gridone-thermostat"],
    [DeviceType.AhuDoubleFlux, "lucide-gridone-air-handler-double-flow"],
    [DeviceType.AhuSingleFlux, "lucide-gridone-air-handler-single-flow"],
    [DeviceType.AirExtractor, "lucide-gridone-air-extractor"],
    [DeviceType.Awhp, "lucide-gridone-heat-pump"],
    [DeviceType.Pump, "lucide-gridone-pump"],
    [DeviceType.ElectricityMeter, "lucide-gridone-electricity-meter"],
    [DeviceType.WeatherSensor, "lucide-gridone-weather-sensor"],
    [DeviceType.LiquidDetector, "lucide-gridone-liquid-detector"],
    [DeviceType.PmsMonitor, "lucide-gridone-pms-monitor"],
  ])("draws the %s pictogram", (type, icon) => {
    const tile = renderTile(type, "running");
    expect(tile.querySelector("svg")).toHaveClass(icon);
  });

  it.each([
    ["an untyped device", null],
    ["an unknown type", "vendor_box"],
  ])("falls back to the neutral chip for %s", (_, type) => {
    const tile = renderTile(type, "unknown");
    expect(tile.querySelector("svg")).toHaveClass("lucide-cpu");
  });

  it.each([
    ["running", "text-foreground", false],
    ["reporting", "text-foreground", false],
    ["idle", "text-muted-foreground/70", false],
    ["unknown", "text-muted-foreground/50", true],
  ] as const)(
    "draws a %s device in %s, dashed: %s",
    (activity, tone, dashed) => {
      const tile = renderTile(DeviceType.Pump, activity);
      expect(tile).toHaveAttribute("data-activity", activity);
      expect(tile.querySelector("svg")).toHaveClass(tone);
      if (dashed) expect(tile).toHaveClass("border-dashed");
      else expect(tile).not.toHaveClass("border-dashed");
    },
  );

  it("is decorative — the card writes the type out beside it", () => {
    const tile = renderTile(DeviceType.Pump, "running");
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
