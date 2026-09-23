import type { ReactNode } from "react";
import type { Projection } from "@gridone/sdk";
import { PIPE_AXIS_Z, type Plane } from "../projection";
import type { Pt } from "../types";
import { capsulePts, circlePts, dishedPts, square } from "./extrude";
import { TANK_R, VOLUMES, type Volume } from "./kit";
import { PlanCircle, PlanLine, PlanPoly, PlanText, rot } from "./plan";

/** Where a plan glyph comes from: the graphical symbol of ISO 14617 or
 *  its ISO 10628-2 example it is drawn after, by registration number, and
 *  what was adapted when the trade draws it otherwise. The reference
 *  table of `docs/specs/synoptic-visual-language.md` lists every `ref`;
 *  a spec keeps the two in step. */
export type SymbolStandard = { ref: string; note?: string };

/** How a symbol type is drawn: one plan glyph, and the height the
 *  isometric view gives its silhouette. Footprint, ports and inline
 *  capability come from the registry, not from here. */
export type SymbolDrawing = {
  /** The standard symbol the plan glyph is drawn after. */
  standard: SymbolStandard;
  /** Plan glyph centred on `c`, on `plane`. `d` is the run direction for
   *  inline types; `closed` only matters to an isolation valve, undefined
   *  while its state is unknown. */
  plan: (plane: Plane, c: Pt, d: Pt, closed: boolean | undefined) => ReactNode;
  /** Plan silhouette, extruded in the isometric view and used as the
   *  body-filled disc of an inline type. */
  outline?: (c: Pt) => Pt[];
  /** Height of the plane the glyph sits on: the floor, or the pipe axis. */
  base: number;
  /** Extrusion height in cells; 0 draws the glyph flat on its plane. */
  height: number;
  /** The link writes its caption on the face instead of above the body. */
  labelOnFace?: boolean;
  /** The mark the glyph carries when the instance has no label: the
   *  `kWh` of a meter. */
  mark?: string;
  /** How the isometric view draws the type: the illustrated volume of the
   *  kit, the plan silhouette a run stops at (the glyph's when absent),
   *  and the height its top reaches, where the label sits. Without it the
   *  isometric view extrudes the plan glyph. */
  iso?: { volume: Volume; outline?: (c: Pt) => Pt[]; top: number };
};

/** The plan silhouette of a type in a projection: the volume's in the
 *  isometric view, the glyph's on the sheet. */
export const outlineFor = (
  drawing: SymbolDrawing,
  projection: Projection,
): ((c: Pt) => Pt[]) | undefined =>
  projection === "isometric"
    ? (drawing.iso?.outline ?? drawing.outline)
    : drawing.outline;

/** The height the drawing reaches in a projection, in cells above its
 *  floor: the volume's top in the isometric view, the extrusion's else. */
export const topOf = (drawing: SymbolDrawing, projection: Projection) =>
  projection === "isometric" && drawing.iso
    ? drawing.iso.top
    : drawing.base + drawing.height;

const VALVE_R = 0.26;
/** Radius of an inline glyph and of the disc that breaks the run under it. */
export const INLINE_R = 0.3;
/** The actuator of a motorised valve: a stem from the seat, and the motor
 *  circle at its end (ISO 14617 C0082, the `M` in a circle). */
const STEM = 0.34;
const MOTOR_R = 0.15;

const bowtie = (r: number) => [
  { x: -r, y: -r * 0.7 },
  { x: -r, y: r * 0.7 },
  { x: r, y: -r * 0.7 },
  { x: r, y: r * 0.7 },
];

/** The valve of ISO 14617 (2101): two triangles tip to tip across the
 *  run. Solid when closed, hollow when open, muted while the state is
 *  unknown so a silent valve never reads as open. A tee adds the third
 *  port of the three-way valve (2103) on the `+y` side of the run. */
function valve(
  plane: Plane,
  c: Pt,
  d: Pt,
  tee: boolean,
  closed: boolean | undefined,
) {
  const r = VALVE_R;
  return (
    <>
      <PlanPoly
        plane={plane}
        points={rot(bowtie(r), c, d)}
        cls={closed === undefined ? "detail" : closed ? "fill" : "outline"}
      />
      {tee && (
        <PlanPoly
          plane={plane}
          points={rot(
            [
              { x: 0, y: 0 },
              { x: -r * 0.7, y: r },
              { x: r * 0.7, y: r },
            ],
            c,
            d,
          )}
        />
      )}
    </>
  );
}

/** The electric actuator on a valve's seat, on the `-y` side of the run
 *  (the tee of a three-way valve takes the `+y` side): the stem and the
 *  motor circle with its `M`. */
function actuator(plane: Plane, c: Pt, d: Pt) {
  const [seat, top, motor] = rot(
    [
      { x: 0, y: 0 },
      { x: 0, y: -STEM },
      { x: 0, y: -STEM - MOTOR_R },
    ],
    c,
    d,
  );
  return (
    <g data-actuator>
      <PlanLine plane={plane} a={seat} b={top} cls="outline" />
      <PlanCircle plane={plane} c={motor} r={MOTOR_R} />
      <PlanText plane={plane} at={motor} text="M" />
    </g>
  );
}

/** The liquid pump of ISO 14617 (2301): a circle with the triangle
 *  inscribed in it, its apex on the circle downstream and its base the
 *  chord upstream. */
function pump(plane: Plane, c: Pt, d: Pt, r = INLINE_R) {
  const tri = [
    { x: -r * 0.5, y: -r * 0.866 },
    { x: -r * 0.5, y: r * 0.866 },
    { x: r, y: 0 },
  ];
  return (
    <>
      <PlanCircle plane={plane} c={c} r={r} />
      <PlanPoly plane={plane} points={rot(tri, c, d)} cls="outline" />
    </>
  );
}

/** The compressor of ISO 14617 (2302): the pump's circle with the
 *  triangle the other way round, its base the chord downstream. */
function compressor(plane: Plane, c: Pt, r: number) {
  const tri = [
    { x: r * 0.5, y: -r * 0.866 },
    { x: r * 0.5, y: r * 0.866 },
    { x: -r, y: 0 },
  ];
  return (
    <>
      <PlanCircle plane={plane} c={c} r={r} />
      <PlanPoly
        plane={plane}
        points={rot(tri, c, { x: 1, y: 0 })}
        cls="outline"
      />
    </>
  );
}

/** The heat pump has no symbol of its own in ISO 14617: it is drawn as
 *  the unit's frame with the compressor of its refrigeration circuit
 *  inside, the way EN 1861 draws a packaged refrigeration unit. */
const heatPump: SymbolDrawing = {
  standard: {
    ref: "ISO 14617 2302",
    note: "compressor (EN 1861) inside the unit's frame; no heat-pump symbol",
  },
  plan: (p, c) => (
    <>
      <PlanPoly plane={p} points={square(c.x - 1, c.y - 1, 2, 2)} />
      {compressor(p, c, 0.48)}
    </>
  ),
  outline: (c) => square(c.x - 1, c.y - 1, 2, 2),
  base: 0,
  height: 1.1,
};

/** The vessel with dished ends of ISO 14617 (2062), standing in its
 *  1 x 2 footprint: the storage cylinder as a schematic draws it. */
const TANK_HW = 0.4;
const TANK_HH = 0.78;
const TANK_BULGE = 0.14;
const tank: SymbolDrawing = {
  standard: { ref: "ISO 14617 2062" },
  plan: (p, c) => (
    <PlanPoly plane={p} points={dishedPts(c, TANK_HW, TANK_HH, TANK_BULGE)} />
  ),
  outline: (c) => dishedPts(c, TANK_HW, TANK_HH, TANK_BULGE),
  base: 0,
  height: 2,
};

const mixingValve: SymbolDrawing = {
  standard: { ref: "ISO 14617 2103", note: "with the C0082 motor actuator" },
  plan: (p, c, d) => (
    <>
      {valve(p, c, d, true, false)}
      {actuator(p, c, d)}
    </>
  ),
  outline: (c) => circlePts(c, VALVE_R),
  base: PIPE_AXIS_Z,
  height: 0,
};

const pumpSingle: SymbolDrawing = {
  standard: { ref: "ISO 14617 2301" },
  plan: (p, c, d) => pump(p, c, d),
  base: PIPE_AXIS_Z,
  height: 0,
};

const valveIsolation: SymbolDrawing = {
  standard: {
    ref: "ISO 14617 2101",
    note: "solid when closed, hollow when open: a supervision convention",
  },
  plan: (p, c, d, closed) => valve(p, c, d, false, closed),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Motorised two-way valve: the valve with its electric actuator. Its
 *  slot is a position, never a state, so the bowtie always takes the
 *  no-reading stroke. */
const valveControl: SymbolDrawing = {
  standard: { ref: "ISO 14617 2101", note: "with the C0082 motor actuator" },
  plan: (p, c, d) => (
    <>
      {valve(p, c, d, false, undefined)}
      {actuator(p, c, d)}
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** The check valve of ISO 10628-2 (X8077): the valve with a disc on its
 *  upstream apex, where the seat is. */
const valveCheck: SymbolDrawing = {
  standard: { ref: "ISO 10628-2 X8077" },
  plan: (p, c, d) => (
    <>
      {valve(p, c, d, false, false)}
      <PlanCircle
        plane={p}
        c={rot([{ x: -VALVE_R, y: 0 }], c, d)[0]}
        r={0.07}
        cls="fill"
      />
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Off-page connector, pointing the way flow leaves the plate (`-x`). */
const link: SymbolDrawing = {
  standard: { ref: "ISO 10628-1 off-page connector" },
  plan: (p, c) => (
    <PlanPoly
      plane={p}
      points={[
        { x: c.x - 0.1, y: c.y - 1 },
        { x: c.x + 0.4, y: c.y - 1 },
        { x: c.x + 0.4, y: c.y + 1 },
        { x: c.x - 0.1, y: c.y + 1 },
        { x: c.x - 0.45, y: c.y },
      ]}
    />
  ),
  base: PIPE_AXIS_Z,
  height: 0,
  labelOnFace: true,
};

/** The plate heat exchanger of ISO 14617 (2516): a frame crossed by
 *  both diagonals. */
const plateExchanger: SymbolDrawing = {
  standard: { ref: "ISO 14617 2516" },
  plan: (p, c) => (
    <>
      <PlanPoly plane={p} points={square(c.x - 0.4, c.y - 0.4, 0.8, 0.8)} />
      <PlanLine
        plane={p}
        a={{ x: c.x - 0.4, y: c.y - 0.4 }}
        b={{ x: c.x + 0.4, y: c.y + 0.4 }}
        cls="outline"
      />
      <PlanLine
        plane={p}
        a={{ x: c.x - 0.4, y: c.y + 0.4 }}
        b={{ x: c.x + 0.4, y: c.y - 0.4 }}
        cls="outline"
      />
    </>
  ),
  outline: (c) => square(c.x - 0.4, c.y - 0.4, 0.8, 0.8),
  base: 0,
  height: 1.1,
};

/** The air separator: a separator's drum on the run with the vent to
 *  atmosphere of ISO 14617 (2039) on top, where the air leaves. */
const airSeparator: SymbolDrawing = {
  standard: {
    ref: "ISO 14617 2039",
    note: "vent on a separator drum; the trade's dégazeur",
  },
  plan: (p, c) => (
    <>
      <PlanCircle plane={p} c={c} r={INLINE_R} />
      <PlanLine
        plane={p}
        a={{ x: c.x, y: c.y - INLINE_R }}
        b={{ x: c.x, y: c.y - INLINE_R - 0.22 }}
        cls="outline"
      />
      <PlanPoly
        plane={p}
        points={[
          { x: c.x - 0.09, y: c.y - INLINE_R - 0.18 },
          { x: c.x + 0.09, y: c.y - INLINE_R - 0.18 },
          { x: c.x, y: c.y - INLINE_R - 0.34 },
        ]}
        cls="fill"
      />
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Capsule with the diaphragm line, drawn as the trade draws it. */
const expansionVessel: SymbolDrawing = {
  standard: {
    ref: "ISO 14617 2062",
    note: "capsule with the membrane line: the trade's vase d'expansion",
  },
  plan: (p, c) => (
    <>
      <PlanPoly plane={p} points={capsulePts(c)} />
      <PlanLine
        plane={p}
        a={{ x: c.x - 0.24, y: c.y }}
        b={{ x: c.x + 0.24, y: c.y }}
      />
    </>
  ),
  outline: (c) => capsulePts(c),
  base: 0,
  height: 0.8,
};

/** The dirt separator: a separator's drum with the settling cone of the
 *  gravity separator of ISO 10628-2 (X8031) under it, where the dirt is
 *  drained. */
const dirtSeparator: SymbolDrawing = {
  standard: {
    ref: "ISO 10628-2 X8031",
    note: "settling cone under a separator drum; the trade's pot à boue",
  },
  plan: (p, c) => (
    <>
      <PlanCircle plane={p} c={c} r={INLINE_R} />
      <PlanPoly
        plane={p}
        points={[
          { x: c.x - 0.16, y: c.y + INLINE_R - 0.02 },
          { x: c.x + 0.16, y: c.y + INLINE_R - 0.02 },
          { x: c.x, y: c.y + INLINE_R + 0.22 },
        ]}
        cls="outline"
      />
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Two pumps side by side across the run. */
const pumpDouble: SymbolDrawing = {
  standard: { ref: "ISO 14617 2301", note: "twice, across the run" },
  plan: (p, c, d) => (
    <>
      {pump(p, rot([{ x: 0, y: -0.24 }], c, d)[0], d, 0.22)}
      {pump(p, rot([{ x: 0, y: 0.24 }], c, d)[0], d, 0.22)}
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Energy meter: the measuring instrument's circle on the run, its
 *  register named by the `kWh` mark. */
const energyMeter: SymbolDrawing = {
  standard: {
    ref: "ISO 14617-6 instrument",
    note: "the instrument circle; the register is the kWh mark",
  },
  plan: (p, c) => (
    <>
      <PlanCircle plane={p} c={c} r={INLINE_R} />
      <PlanLine
        plane={p}
        a={{ x: c.x - 0.16, y: c.y }}
        b={{ x: c.x + 0.16, y: c.y }}
      />
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
  mark: "kWh",
};

/** Loop heater: the heat exchanger with coil-shaped tubes of ISO 14617
 *  (2514), a housing with the heating element's zigzag across it, the
 *  electric heater the panoplie P&IDs put on the bouclage return. */
const loopHeater: SymbolDrawing = {
  standard: { ref: "ISO 14617 2514", note: "electric, as ISO 10628-2 X8132" },
  plan: (p, c) => {
    const zig = [0, 1, 2, 3, 4, 5].map((i) => ({
      x: c.x - 0.2 + 0.08 * i,
      y: c.y + (i % 2 ? 0.1 : -0.1),
    }));
    return (
      <>
        <PlanPoly plane={p} points={square(c.x - 0.3, c.y - 0.3, 0.6, 0.6)} />
        {zig.slice(1).map((b, i) => (
          <PlanLine key={i} plane={p} a={zig[i]} b={b} />
        ))}
      </>
    );
  },
  outline: (c) => square(c.x - 0.3, c.y - 0.3, 0.6, 0.6),
  base: PIPE_AXIS_Z,
  height: 0,
};

const GLYPHS: Record<string, SymbolDrawing> = {
  heat_pump: heatPump,
  tank,
  mixing_valve: mixingValve,
  pump: pumpSingle,
  valve_isolation: valveIsolation,
  valve_check: valveCheck,
  valve_control: valveControl,
  link,
  plate_exchanger: plateExchanger,
  air_separator: airSeparator,
  expansion_vessel: expansionVessel,
  dirt_separator: dirtSeparator,
  pump_double: pumpDouble,
  energy_meter: energyMeter,
  loop_heater: loopHeater,
};

const box = (hx: number, hy: number) => (c: Pt) =>
  square(c.x - hx, c.y - hy, 2 * hx, 2 * hy);
const disc = (r: number) => (c: Pt) => circlePts(c, r);

/** The plan silhouette of each volume, where a run meets the machine and
 *  what a fault outline wraps, and the height its top reaches. Sized to
 *  the volumes of `kit.tsx`. The link keeps the glyph's outline (none: a
 *  run reaches its face) and writes its caption on the face. */
const ISO: Record<string, { outline?: (c: Pt) => Pt[]; top: number }> = {
  heat_pump: { outline: box(0.94, 0.94), top: 1.55 },
  tank: { outline: disc(TANK_R), top: 2.38 },
  mixing_valve: { outline: box(0.32, 0.32), top: 1.37 },
  pump: { outline: disc(0.34), top: 1.17 },
  valve_isolation: { outline: disc(0.28), top: 1.07 },
  valve_check: { outline: disc(0.26), top: 0.56 },
  valve_control: { outline: disc(0.28), top: 1.35 },
  link: { top: PIPE_AXIS_Z },
  plate_exchanger: { outline: box(0.4, 0.4), top: 1.3 },
  air_separator: { outline: disc(0.28), top: 1.5 },
  expansion_vessel: { outline: disc(0.42), top: 1.2 },
  dirt_separator: { outline: disc(0.28), top: 0.95 },
  pump_double: { outline: disc(0.3), top: 1.17 },
  energy_meter: { outline: box(0.3, 0.26), top: 0.95 },
  loop_heater: { outline: box(0.45, 0.28), top: 0.7 },
};

/** The hydronic set, keyed by registry type: the plan glyph of the sheet
 *  and the illustrated volume of the isometric view. The collector is not
 *  a drawing: its shape is authored per instance. */
export const DRAWINGS: Record<string, SymbolDrawing> = Object.fromEntries(
  Object.entries(GLYPHS).map(([type, glyph]) => [
    type,
    VOLUMES[type] && ISO[type]
      ? { ...glyph, iso: { volume: VOLUMES[type], ...ISO[type] } }
      : glyph,
  ]),
);
