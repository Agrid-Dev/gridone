import type { ReactNode } from "react";
import { PIPE_AXIS_Z, type Plane } from "../projection";
import type { Pt } from "../types";
import { capsulePts, circlePts, square } from "./extrude";
import { PlanCircle, PlanLine, PlanPoly, rot } from "./plan";

/** How a symbol type is drawn: one plan glyph, and the height the
 *  isometric view gives its silhouette. Footprint, ports and inline
 *  capability come from the registry, not from here. */
export type SymbolDrawing = {
  /** Plan glyph centred on `c`, on `plane`. `d` is the run direction for
   *  inline types; `closed` only matters to an isolation valve. */
  plan: (plane: Plane, c: Pt, d: Pt, closed: boolean) => ReactNode;
  /** Plan silhouette, extruded in the isometric view and used as the
   *  body-filled disc of an inline type. */
  outline?: (c: Pt) => Pt[];
  /** Height of the plane the glyph sits on: the floor, or the pipe axis. */
  base: number;
  /** Extrusion height in cells; 0 draws the glyph flat on its plane. */
  height: number;
  /** The link writes its caption on the face instead of above the body. */
  labelOnFace?: boolean;
};

const VALVE_R = 0.26;
/** Radius of an inline glyph and of the disc that breaks the run under it. */
export const INLINE_R = 0.3;

const bowtie = (r: number) => [
  { x: -r, y: -r * 0.7 },
  { x: -r, y: r * 0.7 },
  { x: r, y: -r * 0.7 },
  { x: r, y: r * 0.7 },
];

/** ISA bowtie across the run, solid when closed; a tee adds the third port
 *  on the `+y` side of the run. */
function valve(plane: Plane, c: Pt, d: Pt, tee: boolean, closed: boolean) {
  const r = VALVE_R;
  return (
    <>
      <PlanPoly
        plane={plane}
        points={rot(bowtie(r), c, d)}
        cls={closed ? "fill" : "outline"}
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

/** ISA pump: circle with the impeller triangle pointing downstream. */
function pump(plane: Plane, c: Pt, d: Pt, r = INLINE_R) {
  const tri = [
    { x: -r * 0.45, y: -r * 0.55 },
    { x: -r * 0.45, y: r * 0.55 },
    { x: r * 0.7, y: 0 },
  ];
  return (
    <>
      <PlanCircle plane={plane} c={c} r={r} />
      <PlanPoly plane={plane} points={rot(tri, c, d)} cls="detail" />
    </>
  );
}

function fan(plane: Plane, c: Pt, r: number) {
  return (
    <>
      <PlanCircle plane={plane} c={c} r={r} cls="detail" />
      <PlanCircle plane={plane} c={c} r={r * 0.1} cls="fill" />
      {[0, 1, 2].map((k) => {
        const t = (2 * Math.PI * k) / 3;
        return (
          <PlanLine
            key={k}
            plane={plane}
            a={c}
            b={{
              x: c.x + r * 0.85 * Math.cos(t),
              y: c.y + r * 0.85 * Math.sin(t),
            }}
          />
        );
      })}
    </>
  );
}

const heatPump: SymbolDrawing = {
  plan: (p, c) => (
    <>
      <PlanPoly plane={p} points={square(c.x - 1, c.y - 1, 2, 2)} />
      {fan(p, c, 0.55)}
    </>
  ),
  outline: (c) => square(c.x - 1, c.y - 1, 2, 2),
  base: 0,
  height: 1.1,
};

const tank: SymbolDrawing = {
  plan: (p, c) => (
    <>
      <PlanCircle plane={p} c={c} r={0.45} />
      <PlanCircle plane={p} c={c} r={0.3} cls="detail" />
    </>
  ),
  outline: (c) => circlePts(c, 0.45),
  base: 0,
  height: 2,
};

const mixingValve: SymbolDrawing = {
  plan: (p, c, d) => valve(p, c, d, true, false),
  base: PIPE_AXIS_Z,
  height: 0,
};

const pumpSingle: SymbolDrawing = {
  plan: (p, c, d) => pump(p, c, d),
  base: PIPE_AXIS_Z,
  height: 0,
};

const valveIsolation: SymbolDrawing = {
  plan: (p, c, d, closed) => valve(p, c, d, false, closed),
  base: PIPE_AXIS_Z,
  height: 0,
};

const valveCheck: SymbolDrawing = {
  plan: (p, c, d) => (
    <>
      {valve(p, c, d, false, false)}
      <PlanCircle
        plane={p}
        c={rot([{ x: 0.1, y: 0 }], c, d)[0]}
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

const plateExchanger: SymbolDrawing = {
  plan: (p, c) => (
    <>
      <PlanPoly plane={p} points={square(c.x - 0.4, c.y - 0.4, 0.8, 0.8)} />
      <PlanLine
        plane={p}
        a={{ x: c.x - 0.4, y: c.y - 0.4 }}
        b={{ x: c.x + 0.4, y: c.y + 0.4 }}
      />
    </>
  ),
  outline: (c) => square(c.x - 0.4, c.y - 0.4, 0.8, 0.8),
  base: 0,
  height: 1.1,
};

/** Circle, a mesh of three chevrons, air collecting at the top. */
const airSeparator: SymbolDrawing = {
  plan: (p, c) => (
    <>
      <PlanCircle plane={p} c={c} r={INLINE_R} />
      {[-0.1, 0.02, 0.14].map((dy) => (
        <g key={dy}>
          <PlanLine
            plane={p}
            a={{ x: c.x - 0.16, y: c.y + dy + 0.06 }}
            b={{ x: c.x, y: c.y + dy - 0.04 }}
          />
          <PlanLine
            plane={p}
            a={{ x: c.x, y: c.y + dy - 0.04 }}
            b={{ x: c.x + 0.16, y: c.y + dy + 0.06 }}
          />
        </g>
      ))}
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Capsule with the diaphragm line, drawn as the trade draws it. */
const expansionVessel: SymbolDrawing = {
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

/** Circle with a settling cone: dirt collects at the bottom. */
const dirtSeparator: SymbolDrawing = {
  plan: (p, c) => (
    <>
      <PlanCircle plane={p} c={c} r={INLINE_R} />
      <PlanPoly
        plane={p}
        points={[
          { x: c.x - 0.2, y: c.y - 0.02 },
          { x: c.x + 0.2, y: c.y - 0.02 },
          { x: c.x, y: c.y + 0.24 },
        ]}
        cls="detail"
      />
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Two pumps side by side across the run. */
const pumpDouble: SymbolDrawing = {
  plan: (p, c, d) => (
    <>
      {pump(p, rot([{ x: 0, y: -0.24 }], c, d)[0], d, 0.22)}
      {pump(p, rot([{ x: 0, y: 0.24 }], c, d)[0], d, 0.22)}
    </>
  ),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** Energy meter: a square housing with the register window. */
const energyMeter: SymbolDrawing = {
  plan: (p, c) => (
    <>
      <PlanPoly plane={p} points={square(c.x - 0.3, c.y - 0.3, 0.6, 0.6)} />
      <PlanPoly
        plane={p}
        points={square(c.x - 0.18, c.y - 0.12, 0.36, 0.14)}
        cls="detail"
      />
    </>
  ),
  outline: (c) => square(c.x - 0.3, c.y - 0.3, 0.6, 0.6),
  base: PIPE_AXIS_Z,
  height: 0,
};

/** The hydronic set, keyed by registry type. The collector is not a
 *  drawing: its shape is authored per instance. */
export const DRAWINGS: Record<string, SymbolDrawing> = {
  heat_pump: heatPump,
  tank,
  mixing_valve: mixingValve,
  pump: pumpSingle,
  valve_isolation: valveIsolation,
  valve_check: valveCheck,
  link,
  plate_exchanger: plateExchanger,
  air_separator: airSeparator,
  expansion_vessel: expansionVessel,
  dirt_separator: dirtSeparator,
  pump_double: pumpDouble,
  energy_meter: energyMeter,
};
