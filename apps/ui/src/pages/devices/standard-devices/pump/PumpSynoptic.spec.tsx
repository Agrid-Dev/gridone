import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { PumpSynoptic } from "./PumpSynoptic";
import { pumpMotorBox } from "./PumpGlyph";
import { pumpState } from "./state";
import type { PumpValues } from "./types";

vi.mock("react-i18next", () =>
  createI18nMock({
    "pump.name": "Pompe",
    "pump.suction": "Aspiration",
    "pump.discharge": "Refoulement",
    "pump.field.head": "Hauteur manométrique",
    "pump.field.volume_flow": "Débit",
    "pump.field.speed": "Vitesse",
    "pump.field.power": "Puissance",
    "pump.field.liquid_temperature": "Temp. fluide",
  }),
);

const SMART: PumpValues = {
  onoffState: true,
  head: 4.2,
  volumeFlow: 12.5,
  speed: 2400,
  power: 210,
  liquidTemperature: 62.4,
};

/** A circulator wired to a single run contact — the floor of the schema. */
const DRY_CONTACT: PumpValues = { onoffState: true };

afterEach(cleanup);

describe("pumpState", () => {
  it.each([
    ["running when commanded on", { onoffState: true }, "running"],
    ["stopped when commanded off", { onoffState: false }, "stopped"],
    ["unknown before it reports", {}, "unknown"],
  ])("%s", (_label, values, expected) => {
    expect(pumpState(values as PumpValues)).toBe(expected);
  });
});

describe("PumpSynoptic", () => {
  it("labels every placed reading, so no number stands bare", () => {
    render(<PumpSynoptic values={SMART} />);

    for (const [label, value] of [
      ["Vitesse", "2400"],
      ["Puissance", "210"],
      ["Hauteur manométrique", "4.2"],
      ["Débit", "12.5"],
      ["Temp. fluide", "62.4 °"],
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("degrades to the pump alone when only run state is reported", () => {
    render(<PumpSynoptic values={DRY_CONTACT} />);

    expect(screen.getByRole("img", { name: "Pompe" })).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("Débit")).not.toBeInTheDocument();
  });

  it("draws the pump in the hydraulic accent, never a health colour", () => {
    const { container } = render(<PumpSynoptic values={SMART} />);

    expect(container.querySelector(".stroke-water")).not.toBeNull();
    for (const health of ["status-ok", "status-warning", "status-error"]) {
      expect(container.querySelector(`[class*="${health}"]`)).toBeNull();
    }
  });

  it("lands the motor leaders on the motor, not beside it", () => {
    const { container } = render(<PumpSynoptic values={SMART} />);

    // The motor is far narrower than its two tags, so a straight vertical
    // leader stops in empty space — the bug this guards.
    const leaders = [...container.querySelectorAll("polyline")];
    expect(leaders).toHaveLength(2);

    const motor = pumpMotorBox(460, 214, 46);
    for (const leader of leaders) {
      const points = (leader.getAttribute("points") ?? "")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number));
      const [endX, endY] = points[points.length - 1];
      expect(endX).toBeGreaterThanOrEqual(motor.x);
      expect(endX).toBeLessThanOrEqual(motor.x + motor.w);
      expect(endY).toBeGreaterThan(motor.y);
      expect(endY).toBeLessThan(motor.bottom);
    }
  });

  it("stills the flow when the pump is stopped", () => {
    const { container } = render(
      <PumpSynoptic values={{ ...SMART, onoffState: false }} />,
    );

    expect(container.querySelector(".stroke-water")).toBeNull();
    expect(container.querySelector("animateTransform")).toBeNull();
  });
});
