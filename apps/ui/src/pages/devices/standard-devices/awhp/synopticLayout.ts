/**
 * Where everything of the heat pump synoptic stands, in the plate's world
 * cells (`x` right-and-down, `y` left-and-down, `z` up, a cell 48 × 24 px
 * on screen), and how the refrigerant runs through it in each mode. Pure
 * geometry: the drawing is `AwhpSynoptic.tsx`.
 *
 * The plan, back to front: the finned coil with its fan at the back left,
 * the compressor under its four-way valve at the back right, the expansion
 * valve on the liquid line between them, and the plate exchanger in front
 * with the water leaving and returning off the right edge of the slab.
 */
import type { Fluid } from "@gridone/sdk";
import { project } from "@/components/synoptic/projection";
import type { Pt } from "@/components/synoptic/types";
import type { SensorPiece, SynopticMode } from "./synopticModel";

export type Xyz = readonly [number, number, number];

/** A box in world cells. */
export type Box3 = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
};

/** World `(x, y, z)` to screen, the plate's own projection. */
export const P = (x: number, y: number, z: number): Pt =>
  project("isometric", x, y, z);
export const at = ([x, y, z]: Xyz): Pt => P(x, y, z);

export const SLAB = { x0: 0, y0: 0, x1: 14.6, y1: 8.0 };
export const COIL: Box3 = {
  x0: 0.6,
  y0: 0.6,
  x1: 6.0,
  y1: 3.2,
  z0: 0,
  z1: 3.3,
};
export const FAN = { x: 3.3, y: 1.9, r: 1.05 };
export const COMPRESSOR = { x: 10.8, y: 1.9, r: 0.75, z1: 1.1 };
export const VALVE: Box3 = {
  x0: 10.35,
  y0: 1.55,
  x1: 11.25,
  y1: 2.25,
  z0: 2.8,
  z1: 3.4,
};
export const SOLENOID: Box3 = {
  x0: 10.6,
  y0: 1.7,
  x1: 11.0,
  y1: 2.1,
  z0: 3.4,
  z1: 3.75,
};
export const EEV = { x: 7.0, y: 4.8 };
export const PLATE: Box3 = {
  x0: 10.0,
  y0: 5.5,
  x1: 11.6,
  y1: 6.9,
  z0: 0,
  z1: 2.4,
};

/** The runs of the refrigerant circuit, in the order the refrigerant
 *  flows when cooling. */
export const REFRIGERANT_RUNS = [
  "discharge",
  "coil",
  "liquidCoil",
  "liquidPlate",
  "plate",
  "suction",
] as const;
export type RefrigerantRun = (typeof REFRIGERANT_RUNS)[number];

export const WATER_RUNS = ["waterOut", "waterIn"] as const;
export type WaterRun = (typeof WATER_RUNS)[number];

export type Run = RefrigerantRun | WaterRun;

/** Each refrigerant run's waypoints, first to last the way the refrigerant
 *  flows when cooling: out of the compressor, through the valve to the
 *  coil (the condenser), down the liquid line through the expansion valve
 *  to the plate (the evaporator), back through the valve into the
 *  compressor. */
export const REFRIGERANT_ROUTES: Record<RefrigerantRun, Xyz[]> = {
  discharge: [
    [10.8, 1.9, 1.1],
    [10.8, 1.9, 2.8],
  ],
  coil: [
    [10.35, 1.9, 3.1],
    [6.0, 1.9, 3.1],
  ],
  liquidCoil: [
    [6.0, 2.6, 0.4],
    [7.0, 2.6, 0.4],
    [7.0, 4.8, 0.4],
  ],
  liquidPlate: [
    [7.0, 4.8, 0.4],
    [7.0, 6.2, 0.4],
    [10.0, 6.2, 0.4],
  ],
  plate: [
    [10.8, 5.5, 1.6],
    [10.8, 3.4, 1.6],
    [10.8, 3.4, 3.1],
    [10.8, 2.25, 3.1],
  ],
  // The loop behind the compressor, dropping out of sight behind its drum.
  suction: [
    [10.8, 1.55, 3.1],
    [10.8, 0.5, 3.1],
    [10.8, 0.5, 0.7],
    [10.8, 1.15, 0.7],
  ],
};

/** The water always leaves above and returns below, off the right edge. */
export const WATER_ROUTES: Record<WaterRun, Xyz[]> = {
  waterOut: [
    [11.6, 5.9, 1.5],
    [14.4, 5.9, 1.5],
  ],
  waterIn: [
    [14.4, 6.5, 0.5],
    [11.6, 6.5, 0.5],
  ],
};

export type Temperature = "hot" | "cold";

/** Hot gas from the compressor to the condenser and down the liquid line
 *  to the expansion valve, cold from there through the evaporator back to
 *  the compressor. Cooling condenses at the coil, heating at the plate. */
export function runTemperature(
  run: RefrigerantRun,
  mode: SynopticMode,
): Temperature {
  if (run === "discharge") return "hot";
  if (run === "suction") return "cold";
  const coilSide = run === "coil" || run === "liquidCoil";
  return coilSide === (mode === "cool") ? "hot" : "cold";
}

/** The four runs between the valve and the exchangers carry the
 *  refrigerant the other way when heating; discharge and suction never
 *  change. */
export const reversesWhenHeating = (run: RefrigerantRun) =>
  run !== "discharge" && run !== "suction";

/** A run's waypoints, first to last the way the refrigerant flows in
 *  `mode`. */
export function refrigerantRoute(run: RefrigerantRun, mode: SynopticMode) {
  const points = REFRIGERANT_ROUTES[run];
  return mode === "heat" && reversesWhenHeating(run)
    ? [...points].reverse()
    : points;
}

/** The water the unit serves: the heating loop when heating, the chilled
 *  loop when cooling, supply out and return in. */
export function waterFluid(run: WaterRun, mode: SynopticMode): Fluid {
  if (mode === "heat")
    return run === "waterOut" ? "heating_supply" : "heating_return";
  return run === "waterOut" ? "chilled_supply" : "chilled_return";
}

/** Where a sensor's tag hangs: its disc on the run (or on the coil for
 *  the outdoor probe), and its chip's centre, in screen px from the
 *  disc. The sensors of the compressor and the plate exchanger sit in
 *  their machine's panel instead (`PANELS`). */
export type TagSpot = { on: Xyz; run: Run | null; chip: Pt };

export const TAGS: Partial<Record<SensorPiece, TagSpot>> = {
  outdoor_t: { on: [1.2, 1.9, 3.3], run: null, chip: { x: -10, y: -40 } },
  air_p: { on: [8.2, 1.9, 3.1], run: "coil", chip: { x: 0, y: -36 } },
  outlet_t: { on: [14.0, 5.9, 1.5], run: "waterOut", chip: { x: 58, y: -4 } },
  inlet_t: { on: [14.0, 6.5, 0.5], run: "waterIn", chip: { x: 58, y: 8 } },
};

/** The readings each machine's panel lists, in row order. */
export const PANELS = {
  compressor: ["discharge_t", "discharge_p", "suction_t", "suction_p"],
  water: ["water_p"],
} as const satisfies Record<string, readonly SensorPiece[]>;

/** Whether `p` lies on one of the straight segments between `points`. */
export function onRoute(points: readonly Xyz[], p: Xyz): boolean {
  const eps = 1e-6;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const axes = [0, 1, 2] as const;
    const inside = axes.every(
      (k) =>
        p[k] >= Math.min(a[k], b[k]) - eps &&
        p[k] <= Math.max(a[k], b[k]) + eps,
    );
    // On a straight axis-aligned segment, all but one coordinate match
    // the segment's ends.
    const matching = axes.filter(
      (k) => Math.abs(a[k] - b[k]) < eps && Math.abs(p[k] - a[k]) < eps,
    ).length;
    if (inside && matching >= 2) return true;
  }
  return false;
}
