import { describe, expect, it } from "vitest";
import { layoutFace } from "../faceLayout";
import type { Scalar } from "../../conditions";
import {
  AGRID_THERMOSTAT_FACE,
  AGRID_THERMOSTAT_GLYPH_SETS,
  LCD_ORIGIN,
} from "../../fixtures/agridThermostat";
import off from "./fixtures/lvgl/off.layers.json";
import offLocked from "./fixtures/lvgl/off-locked.layers.json";
import onHeat from "./fixtures/lvgl/on-heat-21.0-fanauto-temp21.4-hum44.layers.json";
import onCool from "./fixtures/lvgl/on-cool-21.0-fanauto-temp21.4-hum44.layers.json";
import onAuto from "./fixtures/lvgl/on-auto-21.0-fanauto-temp21.4-hum44.layers.json";
import onFanMode from "./fixtures/lvgl/on-fan-mode.layers.json";
import onHeatPrecision1 from "./fixtures/lvgl/on-heat-21-precision1.layers.json";
import onHeatLocked from "./fixtures/lvgl/on-heat-locked.layers.json";
import onHeatFahrenheit from "./fixtures/lvgl/on-heat-fanlow-70F.layers.json";
import onHeatNoLeafNoHumidity from "./fixtures/lvgl/on-heat-no-leaf-no-humidity.layers.json";

/**
 * Fidelity of the thermostat fixture against the device firmware.
 *
 * The reference lists were rendered from the firmware sources by an exact
 * port of LVGL 9.2's layout and font code (`scene.py` / `render.py` of the
 * LVGL export, see the ADR's annex B): every glyph blit rectangle and every
 * painted rectangle of a screen state. The fixture, laid out by the generic
 * engine from the same binding values, must produce the very same set —
 * position, size and colour — with no tolerance.
 */

type ReferenceLayer = {
  kind: string;
  font?: string;
  codepoint?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: number[];
};

type ReferenceState = {
  state: string;
  params: {
    screen: "on" | "off";
    hvac?: string;
    fanspeed?: string;
    tsetpoint?: number;
    tenth_visible?: boolean;
    temp_text?: string | null;
    hum_text?: string | null;
    leaf?: boolean;
    unit?: string;
    locks?: string[];
  };
  layers: ReferenceLayer[];
};

const FONT_SETS: Record<string, string> = {
  main_font: "main",
  montserrat_16: "montserrat",
};

function bindingsFor(
  params: ReferenceState["params"],
): Record<string, Scalar | null> {
  const locks = new Set(params.locks ?? []);
  return {
    power: params.screen === "on",
    mode: params.hvac ?? "heat",
    fan: params.fanspeed ?? "auto",
    target: params.tsetpoint ?? 21,
    measured: params.temp_text ? Number.parseFloat(params.temp_text) : null,
    humidity: params.hum_text ? Number.parseFloat(params.hum_text) : null,
    print_temperature: params.temp_text != null,
    print_humidity: params.hum_text != null,
    green_leaf: params.leaf ?? false,
    precision: params.tenth_visible === false ? 1 : 0.1,
    unit: `TEMPERATURE_UNIT_${params.unit ?? "C"}_ONLY`,
    state_block: locks.has("state"),
    fan_block: locks.has("fan"),
    mode_block: locks.has("hvac"),
    setpoint_block: locks.has("plus") || locks.has("minus"),
  };
}

const hex = (rgb: number[]) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/** Canonical line per painted element, in LCD coordinates. */
function expectedLines(reference: ReferenceState): string[] {
  return reference.layers
    .flatMap((layer) => {
      if (layer.kind === "glyph") {
        const set = FONT_SETS[layer.font ?? ""];
        const cp = (layer.codepoint ?? 0).toString(16).toUpperCase();
        return [
          `glyph ${set} U+${cp} (${layer.x},${layer.y},${layer.w},${layer.h}) ${hex(layer.color ?? [])}`,
        ];
      }
      // The OFF screen's black background is the bezel image's LCD, not a layer.
      if (
        layer.kind === "rect" ||
        (layer.kind === "bg" && hex(layer.color ?? []) !== "#000000")
      ) {
        return [
          `rect (${layer.x},${layer.y},${layer.w},${layer.h}) ${hex(layer.color ?? [])}`,
        ];
      }
      return [];
    })
    .sort();
}

function actualLines(params: ReferenceState["params"]): string[] {
  const values = bindingsFor(params);
  const setIds = new Map(
    Object.entries(AGRID_THERMOSTAT_GLYPH_SETS).map(([id, set]) => [set, id]),
  );
  const placed = layoutFace({
    document: AGRID_THERMOSTAT_FACE,
    resolve: (binding) => values[binding],
    glyphSet: (id) => AGRID_THERMOSTAT_GLYPH_SETS[id],
  });
  const dx = LCD_ORIGIN.x;
  const dy = LCD_ORIGIN.y;
  return placed
    .flatMap((layer) => {
      if (layer.kind === "glyph-run") {
        return layer.glyphs.map((glyph) => {
          const cp = (glyph.char.codePointAt(0) ?? 0)
            .toString(16)
            .toUpperCase();
          return `glyph ${setIds.get(layer.set)} U+${cp} (${glyph.x - dx},${glyph.y - dy},${glyph.cell.width},${glyph.cell.height}) ${layer.color}`;
        });
      }
      if (layer.kind === "rect") {
        return [
          `rect (${layer.box.x - dx},${layer.box.y - dy},${layer.box.width},${layer.box.height}) ${layer.fill}`,
        ];
      }
      return [];
    })
    .sort();
}

const STATES: ReferenceState[] = [
  onHeat,
  onCool,
  onAuto,
  onFanMode,
  onHeatPrecision1,
  onHeatLocked,
  onHeatFahrenheit,
  onHeatNoLeafNoHumidity,
  off,
  offLocked,
] as ReferenceState[];

describe("Agrid thermostat fixture vs firmware reference renders", () => {
  it.each(STATES.map((state) => [state.state, state] as const))(
    "%s: every glyph and rectangle lands on the device's pixels",
    (_name, state) => {
      expect(actualLines(state.params)).toEqual(expectedLines(state));
    },
  );

  it("covers every element the device draws in the fullest state", () => {
    // Guards the comparison itself: the reference of the locked ON screen
    // holds the digits, unit, icons, bars, top line, leaf and five locks.
    expect(
      expectedLines(onHeatLocked as ReferenceState).length,
    ).toBeGreaterThan(25);
  });
});
