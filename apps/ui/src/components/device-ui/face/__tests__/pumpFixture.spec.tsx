import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceFace } from "../DeviceFace";
import { layoutFace } from "../faceLayout";
import type { Scalar } from "../../conditions";
import { AGRID_THERMOSTAT_GLYPH_SETS } from "../../fixtures/agridThermostat";
import { PUMP_FACE } from "../../fixtures/pump";

afterEach(cleanup);

/**
 * The second fixture (a pump controller) reuses the thermostat's primitives
 * and the generic Montserrat glyph set with differently named attributes:
 * no engine change, no vendor branch.
 */

const glyphSet = (id: string) => AGRID_THERMOSTAT_GLYPH_SETS[id];

function renderPump(values: Record<string, Scalar | null>, onAction = vi.fn()) {
  render(
    <DeviceFace
      document={PUMP_FACE}
      resolve={(b) => values[b]}
      assetUrl={() => undefined}
      glyphSet={glyphSet}
      onAction={onAction}
      language="fr"
    />,
  );
  return onAction;
}

const texts = () =>
  Array.from(document.querySelectorAll('[data-layer="glyph-run"]')).map((el) =>
    el.getAttribute("data-text"),
  );

describe("pump fixture", () => {
  it("shows the running speed centred in the display, in green", () => {
    const placed = layoutFace({
      document: PUMP_FACE,
      resolve: (b) =>
        ({
          running: true,
          speed_percent: 70,
          fault_code: 0,
          panel_lock: false,
        })[b],
      glyphSet,
    });
    const run = placed.find((l) => l.kind === "glyph-run");
    expect(run).toMatchObject({ text: "70%", color: "#39ff88" });
    if (run?.kind !== "glyph-run") throw new Error("no glyph run");
    // "70%" measures 10 + 10 + 14 = 34 px (with the 7→0 kerning), centred
    // in the 240×64 display at (40, 36): 40 + 120 − 17 = 143, 36 + 32 − 9 = 59.
    expect(run.label).toEqual({ x: 143, y: 59, width: 34, height: 18 });
    const lamps = placed.filter((l) => l.kind === "rect" && l.box.width === 10);
    expect(lamps.map((l) => (l.kind === "rect" ? l.fill : ""))).toEqual([
      "#30a46c",
    ]);
  });

  it.each<[string, Record<string, Scalar | null>, string[], string]>([
    [
      "stopped",
      { running: false, speed_percent: 0, fault_code: 0, panel_lock: false },
      ["---"],
      "#6b7280",
    ],
    [
      "faulted",
      { running: true, speed_percent: 70, fault_code: 12, panel_lock: false },
      ["F12"],
      "#e5484d",
    ],
    [
      "unknown speed",
      { running: true, speed_percent: null, fault_code: 0, panel_lock: false },
      [],
      "#30a46c",
    ],
  ])(
    "%s: display and lamp follow the state",
    (_label, values, expectedTexts, lampColor) => {
      renderPump(values);
      expect(texts()).toEqual(expectedTexts);
      const lamps = Array.from(
        document.querySelectorAll<HTMLElement>('[data-layer="rect"]'),
      ).filter((el) => el.style.width === "10px");
      expect(lamps).toHaveLength(1);
      expect(lamps[0].style.backgroundColor).toBe(hexToRgb(lampColor));
    },
  );

  it("dispatches key actions and hides the speed keys while stopped", async () => {
    const user = userEvent.setup();
    const onAction = renderPump({
      running: false,
      speed_percent: 0,
      fault_code: 0,
      panel_lock: false,
    });
    expect(
      screen.queryByRole("button", { name: "Augmenter la vitesse" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Marche / arrêt" }));
    expect(onAction).toHaveBeenCalledWith({ control: "run", op: "toggle" });
  });

  it("keeps every key inert while the panel is locked", async () => {
    const user = userEvent.setup();
    const onAction = renderPump({
      running: true,
      speed_percent: 70,
      fault_code: 0,
      panel_lock: true,
    });
    for (const name of [
      "Marche / arrêt",
      "Réduire la vitesse",
      "Augmenter la vitesse",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      await user.click(button);
    }
    expect(onAction).not.toHaveBeenCalled();
  });
});

function hexToRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
