import { symbolSchemas, type Cell, type Projection } from "@gridone/sdk";
import { project, rotateQuarter, type Plane } from "../projection";
import type { Pt } from "../types";
import type { SymbolState } from "./Label";
import { DRAWINGS, INLINE_R, type SymbolDrawing } from "./drawings";
import { Label, LABEL_SIZE } from "./Label";
import { Body } from "./Body";
import { circlePts, silhouette, square } from "./extrude";
import { PlanPoly, pointsAttr, toPoints, type PlanClass } from "./plan";

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
  // Plan points turn about the centre of the origin cell, the same pivot
  // `symbolPort` turns cell offsets about, so the glyph stays on its ports.
  const local = (p: Pt): Pt => {
    const r = rotateQuarter({ x: p.x - 0.5, y: p.y - 0.5 }, rotation);
    return { x: origin.x + r.x + 0.5, y: origin.y + r.y + 0.5 };
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
  // In isometric an inline glyph sits on the run body-filled so it breaks
  // it, as the sheets draw it; on the sheet the same disc is a plate patch.
  // A glyph with no height gets a plate patch of its own outline in both
  // projections, so a run stops at the drawn edge and its stub reaches it;
  // a body with height occludes on its own. Nothing wider than the glyph
  // is ever painted, so a run never ends at a line nothing draws.
  const face: { points: Pt[]; cls: PlanClass } | null = schema["x-inline"]
    ? {
        points: drawing.outline?.(centre) ?? circlePts(centre, INLINE_R),
        cls: iso ? "face" : "plate",
      }
    : !extruded && drawing.outline
      ? { points: drawing.outline(centre), cls: "plate" }
      : null;
  const anchor = labelAnchor(drawing, projection, planeAt(top), footprint);
  const text = label ?? drawing.mark;

  return (
    <g>
      {extruded && (
        <Body outline={bodyOutline} z0={base} z1={base + drawing.height} />
      )}
      {face && (
        <PlanPoly plane={planeAt(top)} points={face.points} cls={face.cls} />
      )}
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
              : bodyOutline.map((p) =>
                  project(projection, p.x, p.y, base + drawing.height),
                )
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
