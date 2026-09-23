import type { ReactNode } from "react";
import { ISO_AXIS_DEG, isoEllipse, isoHeight } from "../projection";
import type { Pt } from "../types";
import { fillUrl, KIT_GRADIENT } from "./defs";
import { pointsAttr } from "./plan";

/** World plan `(x, y, z)`, in cells, to screen: what every volume of the
 *  illustrated kit draws through. Only the isometric view has one. */
export type Space = (x: number, y: number, z: number) => Pt;

/** A face's paint: a gradient of the kit, or a fill class on a token. */
export type Paint = string;

const paintProps = (paint: Paint) =>
  paint.startsWith("url(") ? { fill: paint } : { className: paint };

/** The 1 px edge every volume is drawn with. */
const EDGE = 1;
const edgeProps = {
  strokeWidth: EDGE,
  strokeLinejoin: "round" as const,
  stroke: "hsl(var(--synoptic-edge))",
};

const round = (v: number) => Math.round(v * 100) / 100;

type BoxProps = {
  P: Space;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
  top?: Paint;
  /** The `+y` face, the darker of the two the viewer sees. */
  left?: Paint;
  /** The `+x` face. */
  right?: Paint;
};

/** An axis-aligned box in world cells: its two visible sides and its top,
 *  lightest on top, darkest on the `+y` face, as the kit shades them. */
export function IsoBox({
  P,
  x0,
  y0,
  x1,
  y1,
  z0,
  z1,
  top = fillUrl(KIT_GRADIENT.top),
  left = fillUrl(KIT_GRADIENT.left),
  right = fillUrl(KIT_GRADIENT.right),
}: BoxProps) {
  const faces: [Pt[], Paint][] = [
    [[P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], left],
    [[P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], right],
    [[P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top],
  ];
  return (
    <g data-volume="box">
      {faces.map(([pts, paint], i) => (
        <polygon
          key={i}
          points={pointsAttr(pts)}
          {...edgeProps}
          {...paintProps(paint)}
        />
      ))}
    </g>
  );
}

type CylinderProps = {
  P: Space;
  cx: number;
  cy: number;
  r: number;
  z0: number;
  z1: number;
  body?: Paint;
  top?: Paint;
};

/** A vertical cylinder: the visible band from `z0` to `z1`, closed by
 *  the front half of its base, and its top disc. */
export function IsoCylinder({
  P,
  cx,
  cy,
  r,
  z0,
  z1,
  body = fillUrl(KIT_GRADIENT.cylinder),
  top = fillUrl(KIT_GRADIENT.top),
}: CylinderProps) {
  const { rx, ry } = isoEllipse(r);
  const base = P(cx, cy, z0);
  const lid = P(cx, cy, z1);
  const d = [
    `M${round(base.x - rx)},${round(lid.y)}`,
    `V${round(base.y)}`,
    `A${round(rx)},${round(ry)} 0 0 0 ${round(base.x + rx)},${round(base.y)}`,
    `V${round(lid.y)}`,
    "Z",
  ].join(" ");
  return (
    <g data-volume="cylinder">
      <path d={d} {...edgeProps} {...paintProps(body)} />
      <ellipse
        cx={round(lid.x)}
        cy={round(lid.y)}
        rx={round(rx)}
        ry={round(ry)}
        {...edgeProps}
        {...paintProps(top)}
      />
    </g>
  );
}

/** A seam around a cylinder at height `z`: the front half of its rim. */
export function IsoSeam({
  P,
  cx,
  cy,
  r,
  z,
}: {
  P: Space;
  cx: number;
  cy: number;
  r: number;
  z: number;
}) {
  const { rx, ry } = isoEllipse(r);
  const at = P(cx, cy, z);
  return (
    <path
      d={`M${round(at.x - rx)},${round(at.y)} A${round(rx)},${round(ry)} 0 0 0 ${round(at.x + rx)},${round(at.y)}`}
      fill="none"
      strokeWidth={EDGE}
      strokeOpacity={0.5}
      className="stroke-synoptic-edge"
    />
  );
}

type SphereProps = {
  P: Space;
  cx: number;
  cy: number;
  r: number;
  z: number;
  body?: Paint;
};

/** A sphere of radius `r` cells centred `z` cells up. */
export function IsoSphere({
  P,
  cx,
  cy,
  r,
  z,
  body = fillUrl(KIT_GRADIENT.cylinder),
}: SphereProps) {
  const at = P(cx, cy, z);
  return (
    <circle
      data-volume="sphere"
      cx={round(at.x)}
      cy={round(at.y)}
      r={round(isoHeight(r) * 1.15)}
      {...edgeProps}
      {...paintProps(body)}
    />
  );
}

type TubeProps = {
  P: Space;
  from: [number, number, number];
  to: [number, number, number];
  /** Radius in cells. */
  r: number;
  body?: Paint;
  /** Round ends for a tube on its own; butt ends for a piece of a longer
   *  tube, so the next piece's edge does not paint a seam across it. */
  caps?: "round" | "butt";
};

/** A round tube between two world points: the edge under a lit fill. */
export function IsoTube({
  P,
  from,
  to,
  r,
  body = fillUrl(KIT_GRADIENT.tube),
  caps = "round",
}: TubeProps) {
  const a = P(...from);
  const b = P(...to);
  const w = isoHeight(r) * 2.2;
  const d = `M${round(a.x)},${round(a.y)} L${round(b.x)},${round(b.y)}`;
  return (
    <g data-volume="tube">
      <path
        d={d}
        fill="none"
        strokeWidth={round(w + 2 * EDGE)}
        strokeLinecap={caps}
        className="stroke-synoptic-edge"
      />
      <path
        d={d}
        fill="none"
        strokeWidth={round(w)}
        strokeLinecap={caps}
        {...(body.startsWith("url(")
          ? { stroke: body }
          : { className: body.replace(/^fill-/, "stroke-") })}
      />
    </g>
  );
}

/** The soft shadow a body throws on the floor. */
export function Shadow({
  P,
  cx,
  cy,
  r,
}: {
  P: Space;
  cx: number;
  cy: number;
  r: number;
}) {
  const at = P(cx, cy, 0);
  const { rx, ry } = isoEllipse(r);
  return (
    <ellipse
      data-volume="shadow"
      cx={round(at.x)}
      cy={round(at.y + 2)}
      rx={round(rx + 3)}
      ry={round(ry + 2)}
      fillOpacity={0.12}
      className="fill-synoptic-dark"
    />
  );
}

/** The 6 px lip of a slab under a group. */
const SLAB_THICKNESS = 6;

/** A slab of floor under a group of equipment: a lit top face on a lip
 *  that gives it thickness. In world cells. */
export function Slab({
  P,
  x0,
  y0,
  x1,
  y1,
}: {
  P: Space;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}) {
  const drop = (p: Pt): Pt => ({ x: p.x, y: p.y + SLAB_THICKNESS });
  const front = [P(x0, y1, 0), P(x1, y1, 0)];
  const side = [P(x1, y0, 0), P(x1, y1, 0)];
  return (
    <g data-slab>
      <polygon
        points={pointsAttr([
          front[0],
          front[1],
          drop(front[1]),
          drop(front[0]),
        ])}
        className="fill-synoptic-slab-edge"
      />
      <polygon
        points={pointsAttr([side[0], side[1], drop(side[1]), drop(side[0])])}
        className="fill-synoptic-slab-lo"
      />
      <polygon
        points={pointsAttr([
          P(x0, y0, 0),
          P(x1, y0, 0),
          P(x1, y1, 0),
          P(x0, y1, 0),
        ])}
        fill={fillUrl(KIT_GRADIENT.slab)}
        strokeWidth={EDGE}
        className="stroke-synoptic-slab-edge"
      />
    </g>
  );
}

/** What a coloured part of a machine says about its run: on, off,
 *  faulty, or nothing known. */
export type Indication = "on" | "off" | "fault" | "unknown";

const INDICATION_CLASS: Record<Indication, string> = {
  on: "fill-status-ok",
  off: "fill-muted-foreground",
  fault: "fill-status-error",
  unknown: "fill-card",
};

/** The 4.5 px dot on a motor or a valve top: the run state in colour, a
 *  dashed hollow dot while nothing is known. */
export function StateDot({ at, state }: { at: Pt; state: Indication }) {
  return (
    <circle
      data-state-dot={state}
      cx={round(at.x)}
      cy={round(at.y)}
      r={4.5}
      strokeWidth={state === "unknown" ? 1 : 1.25}
      strokeDasharray={state === "unknown" ? "2.5 2" : undefined}
      className={`${INDICATION_CLASS[state]} ${
        state === "unknown" ? "stroke-muted-foreground" : "stroke-card"
      }`}
    />
  );
}

/** Three blades around a hub on the top face at `z`: the fan of a heat
 *  pump, turning while the machine runs, coloured by its state. */
export function FanTop({
  P,
  cx,
  cy,
  z,
  r,
  state,
}: {
  P: Space;
  cx: number;
  cy: number;
  z: number;
  r: number;
  state: Indication;
}) {
  const at = P(cx, cy, z);
  const { rx, ry } = isoEllipse(r);
  const scale = rx / 17;
  return (
    <g data-fan={state}>
      <ellipse
        cx={round(at.x)}
        cy={round(at.y)}
        rx={round(rx)}
        ry={round(ry)}
        {...edgeProps}
        className="fill-card"
      />
      <ellipse
        cx={round(at.x)}
        cy={round(at.y)}
        rx={round(rx * 0.7)}
        ry={round(ry * 0.7)}
        fill="none"
        strokeWidth={1}
        strokeOpacity={0.6}
        className="stroke-synoptic-edge"
      />
      {/* The blades turn in the fan's own plane: the group squashes that
          plane to the isometric ellipse, so a plain rotation inside it
          spins the blades in place. */}
      <g
        transform={`translate(${round(at.x)} ${round(at.y)}) scale(${round(scale)} ${round(scale / 2)})`}
      >
        <g
          className={`${INDICATION_CLASS[state === "unknown" ? "off" : state]} ${
            state === "on"
              ? "animate-[spin_2.4s_linear_infinite] motion-reduce:animate-none"
              : ""
          }`}
        >
          {[0, 120, 240].map((angle) => (
            <path
              key={angle}
              transform={`rotate(${angle})`}
              d="M0,-2 C6,-6 7,-14 0,-16 C-7,-14 -6,-6 0,-2 Z"
            />
          ))}
        </g>
      </g>
      <circle
        cx={round(at.x)}
        cy={round(at.y)}
        r={2}
        {...edgeProps}
        className="fill-card"
      />
    </g>
  );
}

/** Text lying along a world axis on the sheet: turned by the axis angle
 *  so a name reads down the bar or the run it belongs to. */
export function AxisText({
  P,
  x,
  y,
  z,
  text,
  axis,
  size = 11,
  weight = 600,
  className = "fill-foreground",
  anchor = "middle",
  children,
}: {
  P: Space;
  x: number;
  y: number;
  z: number;
  text?: string;
  axis: "x" | "y";
  size?: number;
  weight?: number;
  className?: string;
  anchor?: "start" | "middle" | "end";
  children?: ReactNode;
}) {
  const at = P(x, y, z);
  const angle = axis === "x" ? ISO_AXIS_DEG : -ISO_AXIS_DEG;
  return (
    <text
      x={round(at.x)}
      y={round(at.y)}
      textAnchor={anchor}
      fontSize={size}
      fontWeight={weight}
      className={className}
      transform={`rotate(${round(angle)} ${round(at.x)} ${round(at.y)})`}
    >
      {text ?? children}
    </text>
  );
}

/** The actuator of a motorised valve: a stem, a dark box and its letter. */
export function Actuator({
  P,
  x,
  y,
  z,
  letter = "M",
}: {
  P: Space;
  x: number;
  y: number;
  z: number;
  letter?: string;
}) {
  const half = 0.2;
  return (
    <g data-volume="actuator">
      <IsoTube P={P} from={[x, y, z]} to={[x, y, z + 0.35]} r={0.05} />
      <IsoBox
        P={P}
        x0={x - half}
        y0={y - half}
        x1={x + half}
        y1={y + half}
        z0={z + 0.35}
        z1={z + 0.75}
        top="fill-synoptic-dark"
        left="fill-synoptic-dark"
        right="fill-synoptic-dark"
      />
      <AxisText
        P={P}
        x={x}
        y={y + half}
        z={z + 0.5}
        axis="x"
        size={8}
        weight={800}
        className="fill-card"
        text={letter}
      />
    </g>
  );
}
