import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";
import { PumpFleetSummary } from "./PumpFleetSummary";

vi.mock("react-i18next", () =>
  createI18nMock({
    "pump.name": "Pompe",
    "pump.state.running": "En marche",
    "pump.state.stopped": "À l'arrêt",
    "pump.state.unknown": "Non relevé",
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

describe("PumpFleetSummary", () => {
  it("shows the pump and its run state, and no reading", () => {
    render(
      <PumpFleetSummary
        device={pump({
          ...value("onoff_state", true),
          ...value("volume_flow", 12.5),
          ...value("head", 4.2),
        })}
      />,
    );

    expect(screen.getByRole("img", { name: /En marche/ })).toBeInTheDocument();
    expect(screen.getByText("En marche")).toBeInTheDocument();
    // A pump's quantities share no unit, so a bare figure would be one number
    // meaning four possible things.
    expect(screen.queryByText("12.5")).not.toBeInTheDocument();
    expect(screen.queryByText("4.2")).not.toBeInTheDocument();
  });

  it("never animates — a grid of spinning pumps is motion with nothing to say", () => {
    const { container } = render(
      <PumpFleetSummary device={pump(value("onoff_state", true))} />,
    );

    expect(container.querySelector("animateTransform")).toBeNull();
  });

  it("reads running vs idle without motion, by filling the volute", () => {
    const running = render(
      <PumpFleetSummary device={pump(value("onoff_state", true))} />,
    );
    expect(running.container.querySelector(".fill-water\\/15")).not.toBeNull();
    cleanup();

    const idle = render(
      <PumpFleetSummary device={pump(value("onoff_state", false))} />,
    );
    expect(idle.container.querySelector(".fill-water\\/15")).toBeNull();
  });

  it("fits the whole glyph in its box, motor included", () => {
    const { container } = render(
      <PumpFleetSummary device={pump(value("onoff_state", true))} />,
    );

    // A square box clips the motor: it reaches 2.27r above the volute centre.
    const svg = container.querySelector("svg");
    const [, y, , h] = (svg?.getAttribute("viewBox") ?? "")
      .split(" ")
      .map(Number);
    const motorTopY = -42 * 2.27;
    expect(y).toBeLessThanOrEqual(motorTopY);
    expect(y + h).toBeGreaterThanOrEqual(42);
  });

  it.each([
    [true, /En marche/],
    [false, /À l'arrêt/],
  ])("names run state %s in the accessible label", (onoff, expected) => {
    render(<PumpFleetSummary device={pump(value("onoff_state", onoff))} />);

    expect(screen.getByRole("img", { name: expected })).toBeInTheDocument();
  });

  it("distinguishes a pump that has never reported", () => {
    render(<PumpFleetSummary device={pump({})} />);

    expect(screen.getByRole("img", { name: /Non relevé/ })).toBeInTheDocument();
  });
});
