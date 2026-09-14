import { symbolSchemas, type Cell, type Projection } from "@gridone/sdk";
import { project, rotateQuarter, type Plane } from "../projection";
import type { Pt } from "../types";
import type { SymbolState } from "./Label";
import { DRAWINGS, INLINE_R, type SymbolDrawing } from "./drawings";
import { Label, LABEL_SIZE } from "./Label";
import { Body } from "./Body";
import { circlePts, silhouette, square } from "./extrude";
import { PlanPoly, pointsAttr, toPoints } from "./plan";

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

const RIGHT = { x: 1, y: 0 };

/** A plan point turned by the symbol's rotation and moved to its origin.
 *  The pivot is the centre of the origin cell, the same one `symbolPort`
 *  turns cell offsets about, so the glyph stays on its ports. */
export function symbolPoint(origin: Cell, rotation: number, p: Pt): Pt {
  const r = rotateQuarter({ x: p.x - 0.5, y: p.y - 0.5 }, rotation);
  return { x: origin.x + r.x + 0.5, y: origin.y + r.y + 0.5 };
}

/** The plane `z` cells above a symbol's floor, in the symbol's own frame. */
function symbolPlane(
  projection: Projection,
  origin: Cell,
  rotation: number,
  z: number,
): Plane {
  return (x, y) => {
    const q = symbolPoint(origin, rotation, { x, y });
    return project(projection, q.x, q.y, (origin.z ?? 0) + z);
  };
}

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
  const local = (p: Pt) => symbolPoint(origin, rotation, p);
  const planeAt = (z: number) => symbolPlane(projection, origin, rotation, z);
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
  // An inline glyph sits on the run body-filled so it breaks it; a glyph
  // with no height does the same on its plane in isometric, so the runs
  // ending under it stop at its edge. A body with height occludes them
  // itself, and on the sheet the footprint does it for every other type.
  const face = schema["x-inline"]
    ? (drawing.outline?.(centre) ?? circlePts(centre, INLINE_R))
    : iso && !extruded && drawing.outline
      ? drawing.outline(centre)
      : null;
  const anchor = labelAnchor(drawing, projection, planeAt(top), footprint);
  const text = label ?? drawing.mark;

  return (
    <g>
      {!iso && !schema["x-inline"] && (
        <PlanPoly plane={planeAt(0)} points={square(0, 0, w, d)} cls="face" />
      )}
      {extruded && (
        <Body outline={bodyOutline} z0={base} z1={base + drawing.height} />
      )}
      {face && <PlanPoly plane={planeAt(top)} points={face} cls="face" />}
      {drawing.plan(
        planeAt(top),
        centre,
        direction,
        state === undefined ? undefined : state === "off",
      )}
      {text && (
        <Label
          text={text}
          at={anchor.at}
          onFace={drawing.labelOnFace}
          faceOffsetX={iso ? 8 : 0}
          lift={anchor.lift}
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

/** Where the label sits: above the top face in isometric, above the
 *  footprint's highest edge on the sheet in flat, whichever way it turns. */
function labelAnchor(
  drawing: SymbolDrawing,
  projection: Projection,
  top: Plane,
  { w, d }: { w: number; d: number },
) {
  const at = top(w / 2, d / 2);
  if (projection === "isometric") {
    return { at, lift: 26 + (drawing.height ? 14 : 0) };
  }
  const edge = Math.min(
    ...square(0, 0, w, d).map((corner) => top(corner.x, corner.y).y),
  );
  return { at, lift: at.y - edge + 10 };
}

/** Screen point the symbol's label sits at, where a readout hangs from.
 *  Null for a type the kit cannot draw. */
export function symbolLabelPoint(
  type: string,
  projection: Projection,
  origin: Cell,
  rotation = 0,
): Pt | null {
  const footprint = symbolSchemas[type]?.["x-footprint"];
  const drawing = DRAWINGS[type];
  if (!footprint || !drawing) return null;
  const top = symbolPlane(
    projection,
    origin,
    rotation,
    drawing.base + drawing.height,
  );
  const { at, lift } = labelAnchor(drawing, projection, top, footprint);
  return { x: at.x, y: at.y - lift };
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
