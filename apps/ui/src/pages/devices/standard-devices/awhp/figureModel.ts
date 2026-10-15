/**
 * The air-to-water heat pump figure, as data: which part of the drawing
 * shows which standard attribute, how the refrigerant flows and warms per
 * mode, and the small maths the live figure needs. Pure — the DOM work is
 * in `useAwhpFigure`, the drawing itself is the generated
 * `figure/awhp-figure.svg`.
 */
import type { AwhpAttributes } from "@/lib/devices";
import { cycleMedia } from "./cycleMedia";

/** A reversible unit heats or cools; the figure knows no third state. */
export type FigureMode = "heat" | "cool";

export type FlowDirection = "fwd" | "back";

/** A temperature profile along a line: `[position 0..1, level 0 cold … 1 hot]`. */
export type ProfileKnot = [number, number];

/** Where the fan sits on screen and how its blade plane projects: a
 *  rotation in that plane is an affine map of the screen. */
export type FanBasis = {
  centre: [number, number];
  ey: [number, number];
  ez: [number, number];
};

export type FigureData = {
  width: number;
  height: number;
  fan: FanBasis;
  flows: Record<FigureMode, Record<string, FlowDirection>>;
  profiles: Record<FigureMode, Record<string, ProfileKnot[]>>;
  tour: string[];
};

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number");

/** The generated `awhp-figure.json` as typed data; throws when the file
 *  does not have the shape the figure needs (a stale generator). */
export function parseFigureData(raw: unknown): FigureData {
  const data = raw as Partial<FigureData> & { fan?: Partial<FanBasis> };
  const { fan } = data;
  if (
    typeof data.width !== "number" ||
    typeof data.height !== "number" ||
    !fan ||
    !isPair(fan.centre) ||
    !isPair(fan.ey) ||
    !isPair(fan.ez) ||
    !data.flows ||
    !data.profiles ||
    !Array.isArray(data.tour)
  ) {
    throw new Error("awhp-figure.json: unexpected shape");
  }
  return {
    width: data.width,
    height: data.height,
    fan: { centre: fan.centre, ey: fan.ey, ez: fan.ez },
    flows: data.flows,
    profiles: data.profiles,
    tour: data.tour,
  };
}

/** The parts of the drawing named by a label. */
export const COMPONENT_PIECES = [
  "air",
  "compressor",
  "valve",
  "eev",
  "water",
] as const;
export type ComponentPiece = (typeof COMPONENT_PIECES)[number];

/** The sensors of the drawing: each one shows one attribute's reading. */
export const SENSOR_PIECES = [
  "suction_t",
  "suction_p",
  "discharge_t",
  "discharge_p",
  "air_p",
  "water_p",
  "outdoor_t",
  "inlet_t",
  "outlet_t",
] as const;
export type SensorPiece = (typeof SENSOR_PIECES)[number];

export type FigurePiece = ComponentPiece | SensorPiece;

/** Attribute keys of the typed AWHP view that the sensors read. */
export type SensorAttribute = keyof Pick<
  AwhpAttributes,
  | "compressorSuctionTemperature"
  | "compressorSuctionPressure"
  | "compressorDischargeTemperature"
  | "compressorDischargePressure"
  | "condenserRefrigerantPressure"
  | "evaporatorRefrigerantPressure"
  | "outdoorTemperature"
  | "inletTemperature"
  | "outletTemperature"
>;

/** Wire names of the sensor attributes, for units and labels. */
export const SENSOR_WIRE_NAMES: Record<SensorAttribute, string> = {
  compressorSuctionTemperature: "compressor_suction_temperature",
  compressorSuctionPressure: "compressor_suction_pressure",
  compressorDischargeTemperature: "compressor_discharge_temperature",
  compressorDischargePressure: "compressor_discharge_pressure",
  condenserRefrigerantPressure: "condenser_refrigerant_pressure",
  evaporatorRefrigerantPressure: "evaporator_refrigerant_pressure",
  outdoorTemperature: "outdoor_temperature",
  inletTemperature: "inlet_temperature",
  outletTemperature: "outlet_temperature",
};

/** The mode the figure draws: the plate exchanger condensing is heating,
 *  anything else is cooling, as `cycleMedia` reads the attribute. */
export function figureMode(mode: string | null): FigureMode {
  return cycleMedia(mode).condenser === "water" ? "heat" : "cool";
}

/**
 * Which attribute a sensor shows. The coil and plate pressure transducers
 * read whichever side of the cycle their exchanger plays in the current
 * mode: the condenser pressure when it condenses, the evaporator pressure
 * when it evaporates.
 */
export function sensorAttribute(
  piece: SensorPiece,
  mode: FigureMode,
): SensorAttribute {
  switch (piece) {
    case "suction_t":
      return "compressorSuctionTemperature";
    case "suction_p":
      return "compressorSuctionPressure";
    case "discharge_t":
      return "compressorDischargeTemperature";
    case "discharge_p":
      return "compressorDischargePressure";
    case "air_p":
      return mode === "cool"
        ? "condenserRefrigerantPressure"
        : "evaporatorRefrigerantPressure";
    case "water_p":
      return mode === "heat"
        ? "condenserRefrigerantPressure"
        : "evaporatorRefrigerantPressure";
    case "outdoor_t":
      return "outdoorTemperature";
    case "inlet_t":
      return "inletTemperature";
    case "outlet_t":
      return "outletTemperature";
  }
}

/** Whether the compressor and fan turn: on, and not held in standby or
 *  alarm by the unit. */
export function isRunning(a: AwhpAttributes): boolean {
  const status = a.unitRunStatus?.toLowerCase() ?? "";
  return a.onoffState === true && status !== "standby" && status !== "alarm";
}

/** The level of a profile at a position, linear between its knots. */
export function levelAt(knots: ProfileKnot[], s: number): number {
  if (knots.length === 0) return 0.5;
  if (s <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [s1, l1] = knots[i];
    if (s <= s1) {
      const [s0, l0] = knots[i - 1];
      return l0 + ((l1 - l0) * (s - s0)) / Math.max(1e-6, s1 - s0);
    }
  }
  return knots[knots.length - 1][1];
}

export type Rgb = [number, number, number];

/** The three colours the temperature scale runs through. */
export type TemperaturePalette = { cold: Rgb; neutral: Rgb; hot: Rgb };

/** A level 0..1 as a colour: cold through neutral to hot, mixed in sRGB. */
export function temperatureColor(
  level: number,
  palette: TemperaturePalette,
): string {
  const t = Math.max(0, Math.min(1, level));
  const [from, to, u] =
    t < 0.5
      ? [palette.cold, palette.neutral, t * 2]
      : [palette.neutral, palette.hot, (t - 0.5) * 2];
  const channel = (i: number) => Math.round(from[i] + (to[i] - from[i]) * u);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

/**
 * An `h s% l%` token (the app's theme variables, e.g. "25 95% 53%") as RGB.
 * Returns null when the token does not parse, so a caller can fall back.
 */
export function hslTokenToRgb(token: string): Rgb | null {
  const match = token.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) return null;
  const h = Number(match[1]) / 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (x: number) => {
    const t = ((x % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((c) =>
    Math.round(c * 255),
  ) as Rgb;
}

/**
 * The SVG `transform` that turns the fan blades by `angle` radians in their
 * own plane. The blades are drawn flat in the plane x = const of the
 * isometric world, so a rotation there is `M · R(angle) · M⁻¹` about the
 * hub on screen, where M maps blade-plane (y, z) to screen pixels.
 */
export function fanTransform(fan: FanBasis, angle: number): string {
  const [a, c] = fan.ey;
  const [b, d] = fan.ez;
  const det = a * d - b * c;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // M R
  const ma = a * cos + b * sin;
  const mb = c * cos + d * sin;
  const mc = -a * sin + b * cos;
  const md = -c * sin + d * cos;
  // (M R) M⁻¹
  const ta = (ma * d - mc * c) / det;
  const tb = (mb * d - md * c) / det;
  const tc = (-ma * b + mc * a) / det;
  const td = (-mb * b + md * a) / det;
  const [cx, cy] = fan.centre;
  const e = cx - (ta * cx + tc * cy);
  const f = cy - (tb * cx + td * cy);
  const n = (v: number) => v.toFixed(4);
  return `matrix(${n(ta)} ${n(tb)} ${n(tc)} ${n(td)} ${n(e)} ${n(f)})`;
}
