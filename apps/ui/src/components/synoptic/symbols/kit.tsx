import type { ReactNode } from "react";
import type { Severity } from "@gridone/sdk";
import { ISO_AXIS_DEG, PIPE_AXIS_Z } from "../projection";
import type { Pt } from "../types";
import { fillUrl, KIT_GRADIENT } from "./defs";
import type { SymbolState } from "./Label";
import { pointsAttr, rot } from "./plan";
import {
  Actuator,
  AxisText,
  FanTop,
  IsoBox,
  IsoCylinder,
  IsoSeam,
  IsoSphere,
  IsoTube,
  Shadow,
  StateDot,
  type Indication,
  type Space,
} from "./volume";

/** What a volume is drawn from. Boxes are drawn in world cells, since
 *  which faces the viewer sees depends on the symbol's turn; round parts
 *  and direction-bound parts take the world centre and run direction. */
export type VolumeContext = {
  /** World plan `(x, y, z)` to screen. */
  P: Space;
  /** Symbol-local plan to world plan: the rotation and the origin. */
  L: (p: Pt) => Pt;
  /** World bounding box of the turned footprint, in cells. */
  rect: { x0: number; y0: number; x1: number; y1: number };
  /** World centre of the footprint. */
  c: Pt;
  /** World run direction of an inline type, unit length. */
  dir: Pt;
  state?: SymbolState;
  /** The device's fault level; null when healthy. */
  fault: Severity | null;
  /** An isolation valve's reading: closed, open, or unknown. */
  closed?: boolean;
};

export type Volume = (ctx: VolumeContext) => ReactNode;

/** The colour a machine's active part takes: an alert or a warning first,
 *  then the run state, else nothing known. An info fault leaves the part
 *  to its state. */
export const indication = (
  state: SymbolState | undefined,
  fault: Severity | null,
): Indication =>
  fault === "alert"
    ? "fault"
    : fault === "warning"
      ? "warning"
      : state === undefined
        ? "unknown"
        : state;

const perp = (d: Pt): Pt => ({ x: -d.y, y: d.x });
const along = (c: Pt, d: Pt, t: number): Pt => ({
  x: c.x + d.x * t,
  y: c.y + d.y * t,
});

/** Radius of the tank's cylinder: wider than its one-cell footprint so a
 *  run meets the drum, as the kit draws it. */
export const TANK_R = 0.62;
/** Height of the heat pump's cabinet, in cells. */
const CABINET_H = 1.3;
/** Radius of the round body of an inline machine on the run. */
const INLINE_BODY_R = 0.28;

const heatPump: Volume = ({ P, rect, c, state, fault }) => {
  const inset = 0.06;
  const x1 = rect.x1 - inset;
  return (
    <>
      <Shadow P={P} cx={c.x} cy={c.y} r={1.15} />
      <IsoBox
        P={P}
        x0={rect.x0 + inset}
        y0={rect.y0 + inset}
        x1={x1}
        y1={rect.y1 - inset}
        z0={0}
        z1={CABINET_H}
      />
      {/* The louvres of the condenser on the +x side. */}
      {[0, 1, 2, 3].map((i) => {
        const z = 0.2 + i * 0.25;
        const a = P(x1, rect.y0 + 0.3, z);
        const b = P(x1, rect.y1 - 0.3, z);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeOpacity={0.7}
            className="stroke-synoptic-edge"
          />
        );
      })}
      <FanTop
        P={P}
        cx={c.x}
        cy={c.y}
        z={CABINET_H}
        r={0.6}
        state={indication(state, fault)}
      />
    </>
  );
};

const tank: Volume = ({ P, c }) => (
  <>
    <Shadow P={P} cx={c.x} cy={c.y} r={TANK_R + 0.06} />
    <IsoCylinder P={P} cx={c.x} cy={c.y} r={TANK_R} z0={0} z1={2.2} />
    <IsoSeam P={P} cx={c.x} cy={c.y} r={TANK_R} z={1.8} />
    <IsoSeam P={P} cx={c.x} cy={c.y} r={TANK_R} z={0.4} />
    <IsoCylinder P={P} cx={c.x} cy={c.y} r={0.32} z0={2.2} z1={2.38} />
  </>
);

const plateExchanger: Volume = ({ P, rect, c }) => {
  const inset = 0.1;
  const y1 = rect.y1 - inset;
  return (
    <>
      <Shadow P={P} cx={c.x} cy={c.y} r={0.55} />
      <IsoBox
        P={P}
        x0={rect.x0 + inset}
        y0={rect.y0 + inset}
        x1={rect.x1 - inset}
        y1={y1}
        z0={0}
        z1={CABINET_H}
      />
      {/* The plates, seen edge-on through the +y face. */}
      {[1, 2, 3, 4, 5].map((i) => {
        const x = rect.x0 + inset + ((rect.x1 - rect.x0 - 2 * inset) * i) / 6;
        const a = P(x, y1, 0.1);
        const b = P(x, y1, CABINET_H - 0.1);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={1}
            strokeOpacity={0.5}
            className="stroke-synoptic-edge"
          />
        );
      })}
    </>
  );
};

/** A pump: the volute on the run, the motor on top, the state on the
 *  motor. `r` scales the twin heads of a double pump. */
function pumpAt(
  P: Space,
  c: Pt,
  state: Indication,
  r = INLINE_BODY_R + 0.06,
): ReactNode {
  const half = r * 0.56;
  const top = 1.02;
  const dot = P(c.x, c.y, top);
  return (
    <>
      <IsoCylinder P={P} cx={c.x} cy={c.y} r={r} z0={0.05} z1={0.62} />
      <IsoBox
        P={P}
        x0={c.x - half}
        y0={c.y - half}
        x1={c.x + half}
        y1={c.y + half}
        z0={0.62}
        z1={top}
        top={fillUrl(KIT_GRADIENT.top)}
        left="fill-synoptic-dark"
        right="fill-synoptic-dark"
      />
      <StateDot at={{ x: dot.x, y: dot.y - 3 }} state={state} />
    </>
  );
}

const pump: Volume = ({ P, c, state, fault }) =>
  pumpAt(P, c, indication(state, fault));

const pumpDouble: Volume = ({ P, c, dir, state, fault }) => {
  const n = perp(dir);
  const ind = indication(state, fault);
  // The head further back paints first.
  const heads = [along(c, n, -0.26), along(c, n, 0.26)].sort(
    (a, b) => a.x + a.y - (b.x + b.y),
  );
  return (
    <>
      {heads.map((h, i) => (
        <g key={i}>{pumpAt(P, h, ind, 0.26)}</g>
      ))}
    </>
  );
};

/** The handwheel of an isolation valve: solid when closed, hollow when
 *  open, dashed and muted while nothing is known. */
function handwheel(P: Space, c: Pt, closed: boolean | undefined) {
  const at = P(c.x, c.y, 0.92);
  const r = 0.24;
  return (
    <>
      <IsoTube P={P} from={[c.x, c.y, 0.6]} to={[c.x, c.y, 0.92]} r={0.045} />
      <ellipse
        data-handwheel={
          closed === undefined ? "unknown" : closed ? "closed" : "open"
        }
        cx={at.x}
        cy={at.y}
        rx={r * 34}
        ry={r * 17}
        strokeWidth={2.5}
        strokeDasharray={closed === undefined ? "3 2" : undefined}
        className={
          closed === undefined
            ? "fill-none stroke-muted-foreground"
            : closed
              ? "fill-synoptic-dark stroke-synoptic-dark"
              : "fill-none stroke-synoptic-dark"
        }
      />
    </>
  );
}

const valveIsolation: Volume = ({ P, c, closed }) => (
  <>
    <IsoCylinder
      P={P}
      cx={c.x}
      cy={c.y}
      r={INLINE_BODY_R}
      z0={0.1}
      z1={0.6}
      body={fillUrl(KIT_GRADIENT.brass)}
      top={fillUrl(KIT_GRADIENT.brass)}
    />
    {handwheel(P, c, closed)}
  </>
);

const valveControl: Volume = ({ P, c }) => (
  <>
    <IsoCylinder
      P={P}
      cx={c.x}
      cy={c.y}
      r={INLINE_BODY_R}
      z0={0.1}
      z1={0.6}
      body={fillUrl(KIT_GRADIENT.brass)}
      top={fillUrl(KIT_GRADIENT.brass)}
    />
    <Actuator P={P} x={c.x} y={c.y} z={0.6} />
  </>
);

const valveCheck: Volume = ({ P, c, dir }) => {
  const n = perp(dir);
  const tip = along(c, dir, 0.52);
  const base = along(c, dir, 0.3);
  const pts = [tip, along(base, n, 0.12), along(base, n, -0.12)].map((p) =>
    P(p.x, p.y, PIPE_AXIS_Z),
  );
  return (
    <>
      <IsoCylinder
        P={P}
        cx={c.x}
        cy={c.y}
        r={INLINE_BODY_R - 0.02}
        z0={0.1}
        z1={0.56}
      />
      <polygon
        data-check-arrow
        points={pointsAttr(pts)}
        className="fill-synoptic-dark"
      />
    </>
  );
};

const mixingValve: Volume = ({ P, c }) => {
  const half = 0.32;
  return (
    <>
      <IsoBox
        P={P}
        x0={c.x - half}
        y0={c.y - half}
        x1={c.x + half}
        y1={c.y + half}
        z0={0.1}
        z1={0.62}
        top={fillUrl(KIT_GRADIENT.brass)}
        left={fillUrl(KIT_GRADIENT.brass)}
        right={fillUrl(KIT_GRADIENT.brass)}
      />
      <Actuator P={P} x={c.x} y={c.y} z={0.62} />
    </>
  );
};

const airSeparator: Volume = ({ P, c }) => (
  <>
    <IsoCylinder P={P} cx={c.x} cy={c.y} r={INLINE_BODY_R} z0={0.05} z1={1} />
    <IsoTube P={P} from={[c.x, c.y, 1]} to={[c.x, c.y, 1.22]} r={0.05} />
    <IsoSphere P={P} cx={c.x} cy={c.y} r={0.11} z={1.36} />
  </>
);

const dirtSeparator: Volume = ({ P, c }) => {
  const drain = P(c.x, c.y, 0);
  return (
    <>
      <IsoTube P={P} from={[c.x, c.y, 0.25]} to={[c.x, c.y, 0.02]} r={0.05} />
      <polygon
        points={pointsAttr([
          { x: drain.x - 4, y: drain.y - 2 },
          { x: drain.x + 4, y: drain.y - 2 },
          { x: drain.x, y: drain.y + 5 },
        ])}
        className="fill-synoptic-dark"
      />
      <IsoCylinder
        P={P}
        cx={c.x}
        cy={c.y}
        r={INLINE_BODY_R}
        z0={0.25}
        z1={0.95}
      />
    </>
  );
};

const expansionVessel: Volume = ({ P, c }) => (
  <>
    <Shadow P={P} cx={c.x} cy={c.y} r={0.5} />
    <IsoTube P={P} from={[c.x, c.y, 0]} to={[c.x, c.y, 0.3]} r={0.06} />
    <IsoSphere
      P={P}
      cx={c.x}
      cy={c.y}
      r={0.42}
      z={0.78}
      body={fillUrl(KIT_GRADIENT.vessel)}
    />
  </>
);

const energyMeter: Volume = ({ P, c }) => {
  const hx = 0.3;
  const hy = 0.26;
  const y1 = c.y + hy;
  const window = [
    P(c.x - 0.22, y1, 0.87),
    P(c.x + 0.22, y1, 0.87),
    P(c.x + 0.22, y1, 0.63),
    P(c.x - 0.22, y1, 0.63),
  ];
  return (
    <>
      <IsoBox
        P={P}
        x0={c.x - hx}
        y0={c.y - hy}
        x1={c.x + hx}
        y1={y1}
        z0={0.5}
        z1={0.95}
      />
      <polygon points={pointsAttr(window)} className="fill-synoptic-dark" />
      <AxisText
        P={P}
        x={c.x}
        y={y1}
        z={0.71}
        axis="x"
        size={6.5}
        weight={800}
        className="fill-synoptic-reading"
        text="kWh"
      />
    </>
  );
};

const loopHeater: Volume = ({ P, c, state, fault }) => {
  const hx = 0.45;
  const hy = 0.28;
  const at = P(c.x, c.y + hy, 0.4);
  const ind = indication(state, fault);
  return (
    <>
      <IsoBox
        P={P}
        x0={c.x - hx}
        y0={c.y - hy}
        x1={c.x + hx}
        y1={c.y + hy}
        z0={0.1}
        z1={0.7}
      />
      {/* The heating element, glowing while it heats. */}
      <path
        data-element={ind}
        d="M-9,0 L-6,-5 L-2,5 L2,-5 L6,5 L9,0"
        fill="none"
        strokeWidth={1.75}
        strokeLinejoin="round"
        className={
          ind === "on"
            ? "stroke-fluid-heating-supply"
            : ind === "fault"
              ? "stroke-status-error"
              : ind === "warning"
                ? "stroke-status-warning"
                : "stroke-muted-foreground"
        }
        transform={`translate(${at.x} ${at.y}) rotate(${ISO_AXIS_DEG})`}
      />
    </>
  );
};

/** The off-page connector: the flat pentagon of the sheet, given a card
 *  face and a shadow so it sits on the plate with the rest of the kit. */
const link: Volume = ({ P, L, c }) => {
  const local = [
    { x: 0.4, y: 0 },
    { x: 0.9, y: 0 },
    { x: 0.9, y: 2 },
    { x: 0.4, y: 2 },
    { x: 0.05, y: 1 },
  ].map(L);
  const pts = local.map((p) => P(p.x, p.y, PIPE_AXIS_Z));
  const shadow = local.map((p) => P(p.x, p.y, 0));
  return (
    <>
      <polygon
        points={pointsAttr(shadow)}
        fillOpacity={0.1}
        className="fill-synoptic-dark"
      />
      <polygon
        data-link-face
        points={pointsAttr(pts)}
        strokeWidth={1.25}
        strokeLinejoin="round"
        className="fill-card stroke-synoptic-edge"
      />
      <IsoTube
        P={P}
        from={[c.x, c.y, 0]}
        to={[c.x, c.y, PIPE_AXIS_Z]}
        r={0.04}
      />
    </>
  );
};

/** The volume of each drawn type, keyed by registry type. */
export const VOLUMES: Record<string, Volume> = {
  heat_pump: heatPump,
  tank,
  mixing_valve: mixingValve,
  pump,
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

/** Rotated points along a run, for the parts a drawing turns with it. */
export const alongRun = rot;
