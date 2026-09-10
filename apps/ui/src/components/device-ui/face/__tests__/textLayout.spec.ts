import { describe, expect, it } from "vitest";
import {
  alignInBox,
  digitOf,
  layoutGlyphText,
  measureText,
  resolveText,
} from "../textLayout";
import type { LoadedGlyphSet, LvAlign } from "../types";
import { AGRID_THERMOSTAT_GLYPH_SETS } from "../../fixtures/agridThermostat";

const main = AGRID_THERMOSTAT_GLYPH_SETS.main;
const montserrat = AGRID_THERMOSTAT_GLYPH_SETS.montserrat;

describe("alignInBox (LVGL lv_obj_align arithmetic)", () => {
  // Expected values come from the firmware layout export (landscape).
  it.each<
    [
      string,
      LvAlign,
      [number, number, number, number],
      number,
      number,
      number,
      number,
      [number, number],
    ]
  >([
    // A 58-px "2" label (147 tall) centred in the 185×95 digits box, dx −54:
    // 153 + (92 − 29) − 54 = 162, 98 + (47 − 73) = 72 — not (185−58)/2.
    [
      "center, odd sizes",
      "center",
      [153, 98, 185, 95],
      58,
      147,
      -54,
      0,
      [162, 72],
    ],
    ["top-mid", "top-mid", [0, 0, 480, 320], 25, 25, -75, 20, [153, 20]],
    ["top-right", "top-right", [0, 0, 480, 320], 22, 22, -30, 20, [428, 20]],
    ["bottom-left", "bottom-left", [0, 0, 480, 320], 120, 100, 0, 0, [0, 220]],
    ["bottom-mid", "bottom-mid", [0, 0, 480, 320], 120, 100, 0, 0, [180, 220]],
    [
      "bottom-right",
      "bottom-right",
      [0, 0, 480, 320],
      120,
      100,
      0,
      0,
      [360, 220],
    ],
    [
      "center of the screen",
      "center",
      [0, 0, 480, 320],
      120,
      100,
      155,
      -15,
      [335, 95],
    ],
    // The top-line value label sits to the right of its icon container.
    [
      "out-right-mid",
      "out-right-mid",
      [153, 20, 25, 25],
      60,
      18,
      10,
      0,
      [188, 23],
    ],
    ["out-left-mid", "out-left-mid", [153, 20, 25, 25], 60, 18, 0, 0, [93, 23]],
    ["left-mid", "left-mid", [10, 10, 100, 51], 20, 20, 0, 0, [10, 25]],
    ["right-mid", "right-mid", [10, 10, 100, 51], 20, 20, 0, 0, [90, 25]],
    ["top-left", "top-left", [10, 10, 100, 51], 20, 20, 3, 4, [13, 14]],
  ])("%s", (_label, align, [px, py, pw, ph], w, h, dx, dy, expected) => {
    expect(
      alignInBox({ x: px, y: py, width: pw, height: ph }, w, h, align, dx, dy),
    ).toEqual({ x: expected[0], y: expected[1] });
  });
});

describe("measureText", () => {
  it("sums advances with pair kerning (montserrat '4' before '°' loses a pixel)", () => {
    expect(measureText(montserrat, "21.4°C")).toBe(9 + 6 + 4 + 10 + 7 + 12);
    expect(measureText(montserrat, "44%")).toBe(11 + 10 + 14);
  });

  it("ignores characters missing from the set", () => {
    expect(measureText(main, "2x1")).toBe(58 + 32);
  });
});

describe("layoutGlyphText", () => {
  it("blits the top-line temperature like the device", () => {
    const run = layoutGlyphText(
      montserrat,
      {
        anchor: {
          box: { x: 153, y: 20, width: 25, height: 25 },
          align: "out-right-mid",
          dx: 10,
        },
        size: { width: 60 },
      },
      "21.4°C",
    );
    expect(run.label).toEqual({ x: 188, y: 23, width: 60, height: 18 });
    expect(run.glyphs.map((g) => [g.char, g.x, g.y])).toEqual([
      ["2", 188, 26],
      ["1", 197, 26],
      [".", 203, 35],
      ["4", 207, 26],
      ["°", 217, 26],
      ["C", 224, 26],
    ]);
  });

  it("applies the glyph offsets of the big digits", () => {
    const run = layoutGlyphText(
      main,
      {
        anchor: {
          box: { x: 153, y: 98, width: 185, height: 95 },
          align: "center",
          dx: -54,
        },
      },
      "2",
    );
    // "2" has ofs_x −1 and ofs_y 30 under a 147-px line: 72 + 147 − 86 − 30.
    expect(run.glyphs[0]).toMatchObject({ char: "2", x: 161, y: 103 });
  });
});

describe("digitOf", () => {
  it.each<[number, number, number, number]>([
    [21.4, 2, 1, 4],
    [21.0, 2, 1, 0],
    [5.5, 0, 5, 5],
    [70.0, 7, 0, 0],
    [-19.5, 1, 9, 5],
    [21.45, 2, 1, 4],
  ])("%s → tens %s, units %s, tenths %s", (value, tens, units, tenths) => {
    expect(digitOf(value, "tens")).toBe(tens);
    expect(digitOf(value, "units")).toBe(units);
    expect(digitOf(value, "tenths")).toBe(tenths);
  });
});

describe("resolveText", () => {
  const values: Record<string, string | number | boolean | null> = {
    target: 21.4,
    unit: "C",
    fan: "auto",
    humidity: null,
  };
  const resolve = (binding: string) => values[binding];

  it("concatenates literals, digits, numbers and selections", () => {
    expect(
      resolveText(
        [
          { digit: { binding: "target", place: "tens" } },
          { digit: { binding: "target", place: "units" } },
          {
            digit: { binding: "target", place: "tenths", chars: "abcdefghij" },
          },
          { literal: " " },
          { number: { binding: "target", decimals: 0 } },
          { select: { binding: "unit", cases: { C: "°C", F: "°F" } } },
        ],
        resolve,
      ),
    ).toBe("21e 21°C");
  });

  it("yields nothing while any bound value is unknown", () => {
    expect(
      resolveText(
        [{ literal: "a" }, { number: { binding: "humidity", decimals: 0 } }],
        resolve,
      ),
    ).toBeNull();
    expect(
      resolveText([{ digit: { binding: "nope", place: "tens" } }], resolve),
    ).toBeNull();
    expect(
      resolveText([{ select: { binding: "humidity", cases: {} } }], resolve),
    ).toBeNull();
  });

  it("falls back to the selection default, or nothing without one", () => {
    expect(
      resolveText(
        [{ select: { binding: "fan", cases: { low: "L" }, default: "?" } }],
        resolve,
      ),
    ).toBe("?");
    expect(
      resolveText(
        [{ select: { binding: "fan", cases: { low: "L" } } }],
        resolve,
      ),
    ).toBeNull();
  });

  it("never renders a digit for a non-numeric binding", () => {
    expect(
      resolveText([{ digit: { binding: "unit", place: "tens" } }], resolve),
    ).toBeNull();
  });
});

describe("glyph set fixtures", () => {
  it("carry the metrics of the firmware fonts", () => {
    const check = (set: LoadedGlyphSet, lineHeight: number, count: number) => {
      expect(set.lineHeight).toBe(lineHeight);
      expect(Object.keys(set.cells)).toHaveLength(count);
    };
    check(main, 147, 37);
    check(montserrat, 18, 16);
    expect(montserrat.kerning?.["4°"]).toBe(-1);
  });
});
