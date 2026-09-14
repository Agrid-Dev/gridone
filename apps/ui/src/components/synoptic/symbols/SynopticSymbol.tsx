import { symbolSchemas, type Cell, type Projection } from "@gridone/sdk";
import { project, rotateQuarter, type Plane } from "../projection";
import type { Pt } from "../types";
import { DRAWINGS } from "./drawings";
import { circlePts, extrude, silhouette, square } from "./extrude";
import { PlanPoly, pointsAttr, toPoints } from "./plan";

/** Run state of a symbol whose `state` slot is bound. */
export type SymbolState = "on" | "off";

type SynopticSymbolProps = {
  /** Registry type name. */
  type: string;
  projection: Projection;
  /** Origin cell of the footprint. */
  origin: Cell;
  /** Quarter turns counter-clockwise about the origin cell. */
  rotation?: number;
  label?: string;
  state?: SymbolState;
  /** `Device.is_faulty` of the bound device. */
  faulty?: boolean;
  /** Run direction an inline type follows, in plan. */
  direction?: Pt;
};

const LABEL_CLASS = "fill-foreground";
const LABEL_SIZE = 11;
const RIGHT = { x: 1, y: 0 };
const FACE_CLASS: Record<"x" | "y", string> = {
  x: "fill-synoptic-body-x",
  y: "fill-synoptic-body-y",
};

/**
 * A symbol of the hydronic set at its cell: the plan glyph on its plane,
 * extruded in the isometric view when the type has height, body-filled
 * under an inline glyph so it breaks the run. Fault wraps the whole body in
 * the error colour with a badge; a bound state lights an LED after the
 * label, except on an isolation valve, which shows it on the glyph.
 */
export function SynopticSymbol({
  type,
  projection,
  origin,
  rotation = 0,
  label,
  state,
  faulty = false,
  direction = RIGHT,
}: SynopticSymbolProps) {
  const schema = symbolSchemas[type];
  const drawing = DRAWINGS[type];
  const footprint = schema?.["x-footprint"];
  const local = (p: Pt): Pt => {
    const r = rotateQuarter(p, rotation);
    return { x: origin.x + r.x, y: origin.y + r.y };
  };
  const planeAt =
    (z: number): Plane =>
    (x, y) => {
      const q = local({ x, y });
      return project(projection, q.x, q.y, (origin.z ?? 0) + z);
    };
  if (!footprint || !drawing) {
    return <UnknownSymbol type={type} plane={planeAt(0)} />;
  }

  const { w, d } = footprint;
  const centre = { x: w / 2, y: d / 2 };
  const iso = projection === "isometric";
  const top = drawing.base + drawing.height;
  const extruded = iso && drawing.height > 0 && drawing.outline;
  const bodyOutline = (drawing.outline?.(centre) ?? square(0, 0, w, d)).map(
    local,
  );
  const base = (origin.z ?? 0) + drawing.base;

  return (
    <g>
      {schema["x-inline"] ? (
        <PlanPoly
          plane={planeAt(top)}
          points={drawing.outline?.(centre) ?? circlePts(centre, 0.3)}
          cls="face"
        />
      ) : extruded ? (
        <Body outline={bodyOutline} z0={base} z1={base + drawing.height} />
      ) : (
        !iso && (
          <PlanPoly plane={planeAt(0)} points={square(0, 0, w, d)} cls="face" />
        )
      )}
      {drawing.plan(planeAt(top), centre, direction, state === "off")}
      {label && (
        <Label
          text={label}
          at={planeAt(top)(centre.x, centre.y)}
          onFace={drawing.labelOnFace === true}
          lift={iso ? 26 + (drawing.height ? 14 : 0) : d * 24 + 10}
          iso={iso}
          led={type === "valve_isolation" ? undefined : state}
          faulty={faulty}
        />
      )}
      {faulty && (
        <Fault
          outline={
            extruded
              ? silhouette(bodyOutline, base, base + drawing.height)
              : bodyOutline.map((p) => project(projection, p.x, p.y, top))
          }
          badge={planeAt(top)(w + 0.1, 0.2)}
        />
      )}
    </g>
  );
}

function Body({ outline, z0, z1 }: { outline: Pt[]; z0: number; z1: number }) {
  const { faces, band, top } = extrude(outline, z0, z1);
  const pts = pointsAttr;
  return (
    <>
      {faces.map((face, i) => (
        <polygon
          key={i}
          points={pts(face.points)}
          className={FACE_CLASS[face.axis]}
        />
      ))}
      <polygon
        points={pts(band)}
        strokeWidth={2}
        strokeLinejoin="round"
        className="fill-none stroke-synoptic-stroke"
      />
      <polygon
        points={pts(top)}
        strokeWidth={2}
        strokeLinejoin="round"
        className="fill-synoptic-body stroke-synoptic-stroke"
      />
    </>
  );
}

type LabelProps = {
  text: string;
  at: Pt;
  onFace: boolean;
  lift: number;
  iso: boolean;
  led?: SymbolState;
  faulty: boolean;
};

function Label({ text, at, onFace, lift, iso, led, faulty }: LabelProps) {
  const lines = onFace ? text.split(" ") : [text];
  const x = onFace && iso ? at.x + 8 : at.x;
  const y = onFace ? at.y + 4 - 6 * (lines.length - 1) : at.y - lift;
  return (
    <>
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontSize={LABEL_SIZE}
        fontWeight={600}
        className={LABEL_CLASS}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
      {led && (
        <circle
          cx={x + 4 * text.length + 10}
          cy={y - 4}
          r={4}
          className={
            faulty
              ? "fill-status-error"
              : led === "on"
                ? "fill-status-ok"
                : "fill-muted-foreground"
          }
        />
      )}
    </>
  );
}

function Fault({ outline, badge }: { outline: Pt[]; badge: Pt }) {
  return (
    <>
      <polygon
        points={pointsAttr(outline)}
        strokeWidth={2.5}
        strokeLinejoin="round"
        className="fill-none stroke-status-error"
      />
      <circle cx={badge.x} cy={badge.y} r={7} className="fill-status-error" />
      <text
        x={badge.x}
        y={badge.y + 3.5}
        textAnchor="middle"
        fontSize={LABEL_SIZE}
        fontWeight={600}
        className="fill-card"
      >
        !
      </text>
    </>
  );
}

/** A type the kit cannot draw: its footprint cell, dashed, with the type
 *  name, so a plate never silently loses a symbol. */
function UnknownSymbol({ type, plane }: { type: string; plane: Plane }) {
  const c = plane(0.5, 0.5);
  return (
    <g data-unknown-symbol={type}>
      <polygon
        points={toPoints(plane, square(0, 0, 1, 1))}
        strokeWidth={1}
        strokeDasharray="3 2"
        className="fill-none stroke-status-error"
      />
      <text
        x={c.x}
        y={c.y + 4}
        textAnchor="middle"
        fontSize={LABEL_SIZE}
        className="fill-status-error"
      >
        {type}
      </text>
    </g>
  );
}
