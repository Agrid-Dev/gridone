import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import { PumpFleetGlyph } from "./PumpFleetGlyph";

vi.mock("react-i18next", () =>
  createI18nMock({
    "pump.name": "Pompe",
  }),
);

function pump(attributes: Record<string, unknown>): Device {
  return {
    id: "d1",
    name: "Pompe PEC E2-A",
    type: DeviceType.Pump,
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes,
  } as unknown as Device;
}

const value = (name: string, current: unknown) => ({
  [name]: {
    kind: "standard",
    name,
    data_type: typeof current === "boolean" ? "bool" : "float",
    read_write_modes: ["read"],
    current_value: current,
    last_updated: null,
    last_changed: null,
  },
});

afterEach(cleanup);

describe("PumpFleetGlyph", () => {
  it("reads running vs idle without motion, by filling the volute", () => {
    const running = render(
      <PumpFleetGlyph device={pump(value("onoff_state", true))} />,
    );
    expect(running.container.querySelector(".fill-water\\/15")).not.toBeNull();
    cleanup();

    const idle = render(
      <PumpFleetGlyph device={pump(value("onoff_state", false))} />,
    );
    expect(idle.container.querySelector(".fill-water\\/15")).toBeNull();
  });

  it("fits the whole drawing in its box, motor included", () => {
    const { container } = render(
      <PumpFleetGlyph device={pump(value("onoff_state", true))} />,
    );

    // A square box clips the motor: it reaches 2.27r above the volute centre.
    const inner = container.querySelector("svg svg");
    const [, y, , h] = (inner?.getAttribute("viewBox") ?? "")
      .split(" ")
      .map(Number);
    const r = 40;
    expect(y).toBeLessThanOrEqual(-r * 2.27);
    expect(y + h).toBeGreaterThanOrEqual(r);
  });
});
