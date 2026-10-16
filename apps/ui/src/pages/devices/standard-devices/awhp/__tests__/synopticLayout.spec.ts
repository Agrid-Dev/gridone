import { describe, expect, it } from "vitest";
import {
  onRoute,
  PANELS,
  REFRIGERANT_ROUTES,
  REFRIGERANT_RUNS,
  refrigerantRoute,
  runTemperature,
  TAGS,
  WATER_ROUTES,
  waterFluid,
} from "../synopticLayout";
import { SENSOR_PIECES } from "../synopticModel";

describe("runTemperature", () => {
  it.each([
    [
      "cool",
      ["discharge", "coil", "liquidCoil"],
      ["liquidPlate", "plate", "suction"],
    ],
    [
      "heat",
      ["discharge", "plate", "liquidPlate"],
      ["liquidCoil", "coil", "suction"],
    ],
  ] as const)(
    "when %s, the hot gas condenses on one side and expands into the other",
    (mode, hot, cold) => {
      for (const run of hot) expect(runTemperature(run, mode)).toBe("hot");
      for (const run of cold) expect(runTemperature(run, mode)).toBe("cold");
    },
  );
});

describe("refrigerantRoute", () => {
  it("turns the four exchanger runs round when heating, never the compressor's", () => {
    for (const run of REFRIGERANT_RUNS) {
      const cool = refrigerantRoute(run, "cool");
      const heat = refrigerantRoute(run, "heat");
      expect(cool).toBe(REFRIGERANT_ROUTES[run]);
      if (run === "discharge" || run === "suction") expect(heat).toBe(cool);
      else expect(heat).toEqual([...cool].reverse());
    }
  });

  it("chains the runs into one circuit, each starting where the last ends", () => {
    const order = [
      "discharge",
      "coil",
      "liquidCoil",
      "liquidPlate",
      "plate",
      "suction",
    ] as const;
    // The valve and the exchangers sit between runs, so consecutive runs
    // share a machine rather than a point: the liquid runs meet at the
    // expansion valve exactly.
    const [, , liquidCoil, liquidPlate] = order;
    const a = REFRIGERANT_ROUTES[liquidCoil];
    const b = REFRIGERANT_ROUTES[liquidPlate];
    expect(a[a.length - 1]).toEqual(b[0]);
  });
});

describe("waterFluid", () => {
  it("serves the heating loop when heating and the chilled loop when cooling", () => {
    expect(waterFluid("waterOut", "heat")).toBe("heating_supply");
    expect(waterFluid("waterIn", "heat")).toBe("heating_return");
    expect(waterFluid("waterOut", "cool")).toBe("chilled_supply");
    expect(waterFluid("waterIn", "cool")).toBe("chilled_return");
  });
});

describe("TAGS and PANELS", () => {
  it("shows every sensor once: on a point of its run, on the coil, or in a machine's panel", () => {
    const inPanels = Object.values(PANELS).flat();
    for (const piece of SENSOR_PIECES) {
      const spot = TAGS[piece];
      if (!spot) {
        expect(inPanels, `${piece} drawn nowhere`).toContain(piece);
        continue;
      }
      expect(inPanels, `${piece} drawn twice`).not.toContain(piece);
      const { on, run } = spot;
      if (run === null) {
        expect(piece).toBe("outdoor_t");
        continue;
      }
      const route =
        run === "waterOut" || run === "waterIn"
          ? WATER_ROUTES[run]
          : REFRIGERANT_ROUTES[run];
      expect(onRoute(route, on), `${piece} off its run`).toBe(true);
    }
  });
});

describe("onRoute", () => {
  it("accepts a point on a segment and rejects one beside it", () => {
    const route = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 3, 0],
    ] as const;
    expect(onRoute(route, [1, 0, 0])).toBe(true);
    expect(onRoute(route, [2, 1.5, 0])).toBe(true);
    expect(onRoute(route, [1, 1, 0])).toBe(false);
    expect(onRoute(route, [3, 0, 0])).toBe(false);
  });
});
