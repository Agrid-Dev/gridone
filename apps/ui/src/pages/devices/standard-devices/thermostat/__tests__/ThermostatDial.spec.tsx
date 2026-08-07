import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.thermostat.setpoint": "Setpoint",
    "controls.thermostat.measured": "Measured",
  }),
);

import { ThermostatDial } from "../ThermostatDial";

/** The dial's viewBox is 240×240 with the track centred at (120, 120), so
 *  pinning the rendered size to 240 CSS pixels at the origin lets a test
 *  point at a value in viewBox coordinates. */
const RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 240,
  bottom: 240,
  width: 240,
  height: 240,
  toJSON: () => ({}),
} as DOMRect;

const MIN = 16;
const MAX = 30;

function renderDial(props: Partial<Parameters<typeof ThermostatDial>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <ThermostatDial
      setpoint={22}
      measured={21.5}
      min={MIN}
      max={MAX}
      isOn
      modeColorClass="text-primary"
      saving={false}
      onChange={onChange}
      step={0.5}
      {...props}
    />,
  );
  return { onChange };
}

const track = () => screen.getByTestId("dial-track");

/** Points on the dial, in viewBox coordinates: the track starts bottom-left
 *  (min), sweeps clockwise through the top (mid) to bottom-right (max). */
const TOP = { clientX: 120, clientY: 20 };
const RIGHT = { clientX: 220, clientY: 120 };
const LEFT = { clientX: 20, clientY: 120 };

beforeEach(() => {
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue(RECT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThermostatDial dragging", () => {
  it("sets the value the pointer lands on", () => {
    const { onChange } = renderDial();

    fireEvent.pointerDown(track(), { ...TOP, button: 0, pointerId: 1 });

    // Straight up is the middle of the 270° sweep: halfway through 16..30.
    expect(onChange).toHaveBeenCalledWith(23);
  });

  it("follows the pointer while dragging", () => {
    const { onChange } = renderDial();

    fireEvent.pointerDown(track(), { ...TOP, button: 0, pointerId: 1 });
    fireEvent.pointerMove(track(), { ...RIGHT, pointerId: 1 });
    fireEvent.pointerMove(track(), { ...LEFT, pointerId: 1 });

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      23, 27.5, 18.5,
    ]);
  });

  it("ignores pointer moves before a drag starts and after it ends", () => {
    const { onChange } = renderDial();

    fireEvent.pointerMove(track(), { ...TOP, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(track(), { ...TOP, button: 0, pointerId: 1 });
    fireEvent.pointerUp(track(), { ...TOP, pointerId: 1 });
    onChange.mockClear();

    fireEvent.pointerMove(track(), { ...RIGHT, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores secondary buttons", () => {
    const { onChange } = renderDial();

    fireEvent.pointerDown(track(), { ...TOP, button: 2, pointerId: 1 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the centre reading out of the way of the grab area", () => {
    renderDial();

    expect(screen.getByText("Setpoint").parentElement).toHaveClass(
      "pointer-events-none",
    );
  });
});

describe("ThermostatDial keyboard", () => {
  it("exposes the setpoint as a slider", () => {
    renderDial();

    const slider = screen.getByRole("slider", { name: "Setpoint" });
    expect(slider).toHaveAttribute("aria-valuenow", "22");
    expect(slider).toHaveAttribute("aria-valuemin", String(MIN));
    expect(slider).toHaveAttribute("aria-valuemax", String(MAX));
  });

  it.each([
    ["ArrowUp", 22.5],
    ["ArrowRight", 22.5],
    ["ArrowDown", 21.5],
    ["ArrowLeft", 21.5],
    ["Home", MIN],
    ["End", MAX],
  ])("steps the setpoint on %s", (key, expected) => {
    const { onChange } = renderDial();

    fireEvent.keyDown(screen.getByRole("slider"), { key });

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("stops at the bounds", () => {
    const { onChange } = renderDial({ setpoint: MAX });

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledWith(MAX);
  });

  it("leaves other keys alone", () => {
    const { onChange } = renderDial();

    fireEvent.keyDown(screen.getByRole("slider"), { key: "a" });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ThermostatDial without onChange", () => {
  it("stays a read-only gauge", () => {
    render(
      <ThermostatDial
        setpoint={22}
        measured={21.5}
        min={MIN}
        max={MAX}
        isOn
        modeColorClass="text-primary"
        saving={false}
      />,
    );

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dial-track")).not.toBeInTheDocument();
  });

  it("has nothing to drag when the setpoint is unknown", () => {
    renderDial({ setpoint: null });

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dial-track")).not.toBeInTheDocument();
  });
});
