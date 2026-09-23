import {
  symbolSchemas,
  type Cell,
  type Projection,
  type Severity,
} from "@gridone/sdk";
import { FAULT_FILL_CLASS, FAULT_STROKE_CLASS } from "../fault";
import { PIPE_AXIS_Z, project, rotateQuarter, type Plane } from "../projection";
import type { Pt } from "../types";
import type { SymbolState } from "./Label";
import {
  DRAWINGS,
  INLINE_R,
  outlineFor,
  topOf,
  type SymbolDrawing,
} from "./drawings";
import { Label, LABEL_SIZE } from "./Label";
import { Body } from "./Body";
import { circlePts, silhouette, square } from "./extrude";
import type { VolumeContext } from "./kit";
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
  /** The bound device's fault level, its worst active severity; null or
   *  absent when it is healthy. */
  fault?: Severity | null;
  /** Run direction an inline type follows, in plan. */
  direction?: Pt;
  /** False when the surface draws the name itself, placed clear of the
   *  plate and painted over it. */
  showLabel?: boolean;
};

const RIGHT = { x: 1, y: 0 };

/** A label sits this far above the top of the volume it names. */
const VOLUME_LABEL_LIFT = 10;
/** A link's caption starts this far past the tip of its arrow. */
const LINK_LABEL_GAP = 8;
/** The link's plan outline: the tip its arrow points with, and the back
 *  edge, in the symbol's own frame (a 1 x 2 footprint). */
const LINK_TIP = { x: 0.05, y: 1 };
const LINK_BACK = { x: 0.9, y: 1 };

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
 * A symbol of the hydronic set at its cell. On the sheet, the plan glyph
 * on its plane, body-filled under an inline glyph so it breaks the run.
 * In the isometric view, the illustrated volume of the kit, which shows
 * the run state on the machine itself (the fan, the motor's dot, the
 * handwheel), so the label carries no LED there. Fault wraps the whole
 * body in the error colour with a badge.
 */
export function SynopticSymbol({
  type,
  projection,
  origin,
  rotation = 0,
  label,
  state,
  fault = null,
  direction = RIGHT,
  showLabel = true,
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
  const volume = iso ? drawing.iso : undefined;
  const top = topOf(drawing, projection);
  const extruded = iso && !volume && drawing.height > 0 && drawing.outline;
  const outline = outlineFor(drawing, projection);
  const bodyOutline = (outline?.(centre) ?? square(0, 0, w, d)).map(local);
  const base = (origin.z ?? 0) + drawing.base;
  const floor = origin.z ?? 0;
  // In isometric an inline glyph sits on the run body-filled so it breaks
  // it, as the sheets draw it; on the sheet the same disc is a plate patch.
  // A glyph with no height gets a plate patch of its own outline in both
  // projections, so a run stops at the drawn edge and its stub reaches it;
  // a body with height occludes on its own. Nothing wider than the glyph
  // is ever painted, so a run never ends at a line nothing draws.
  const face: { points: Pt[]; cls: PlanClass } | null = volume
    ? null
    : schema["x-inline"]
      ? {
          points: drawing.outline?.(centre) ?? circlePts(centre, INLINE_R),
          cls: iso ? "face" : "plate",
        }
      : !extruded && drawing.outline
        ? { points: drawing.outline(centre), cls: "plate" }
        : null;
  const spec = symbolLabelAnchor(type, projection, origin, rotation)!;
  // The volume draws its own mark on the machine; the sheet glyph needs it.
  const text = label ?? (volume ? undefined : drawing.mark);
  const closed = state === undefined ? undefined : state === "off";

  return (
    <g>
      {extruded && (
        <Body outline={bodyOutline} z0={base} z1={base + drawing.height} />
      )}
      {face && (
        <PlanPoly plane={planeAt(top)} points={face.points} cls={face.cls} />
      )}
      {volume
        ? volume.volume(
            volumeContext(
              projection,
              origin,
              rotation,
              footprint,
              direction,
              state,
              fault,
              closed,
            ),
          )
        : drawing.plan(planeAt(top), centre, direction, closed)}
      {text && showLabel && (
        <Label
          text={text}
          at={spec.at}
          onFace={spec.onFace}
          lift={0}
          anchor={spec.anchor}
          led={type === "valve_isolation" || volume ? undefined : state}
          fault={fault}
        />
      )}
      {fault && (
        <FaultMark
          level={fault}
          outline={
            iso && (volume || extruded)
              ? silhouette(bodyOutline, volume ? floor : base, floor + top)
              : bodyOutline.map((p) => project(projection, p.x, p.y, base))
          }
          badge={planeAt(top)(w + 0.1, 0.2)}
        />
      )}
    </g>
  );
}

/** What a volume draws from: world plan to screen, the symbol's own frame
 *  to world plan, its turned footprint and centre, and the run direction. */
function volumeContext(
  projection: Projection,
  origin: Cell,
  rotation: number,
  { w, d }: { w: number; d: number },
  direction: Pt,
  state: SymbolState | undefined,
  fault: Severity | null,
  closed: boolean | undefined,
): VolumeContext {
  const z = origin.z ?? 0;
  const L = (p: Pt) => symbolPoint(origin, rotation, p);
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ].map(L);
  const rect = {
    x0: Math.min(...corners.map((p) => p.x)),
    y0: Math.min(...corners.map((p) => p.y)),
    x1: Math.max(...corners.map((p) => p.x)),
    y1: Math.max(...corners.map((p) => p.y)),
  };
  return {
    P: (x, y, dz) => project(projection, x, y, z + dz),
    L,
    rect,
    c: { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 },
    dir: direction,
    state,
    fault,
    closed,
  };
}

/** Where the label sits: above the volume in isometric, above the
 *  footprint's highest edge on the sheet in flat, whichever way it turns. */
function labelAnchor(
  drawing: SymbolDrawing,
  projection: Projection,
  top: Plane,
  { w, d }: { w: number; d: number },
) {
  const at = top(w / 2, d / 2);
  if (projection === "isometric") {
    return {
      at,
      lift: drawing.iso ? VOLUME_LABEL_LIFT : 16 + (drawing.height ? 8 : 0),
    };
  }
  const edge = Math.min(
    ...square(0, 0, w, d).map((corner) => top(corner.x, corner.y).y),
  );
  return { at, lift: at.y - edge + 10 };
}

/** Where a symbol's label goes and how it is anchored: centred above the
 *  body; on the face for a type that writes there on the sheet; beside
 *  the tip of a link's arrow in the isometric view, where the face is too
 *  small for a caption and the plate's edge has room. `at` is the text's
 *  baseline point. Null for a type the kit cannot draw. */
export function symbolLabelAnchor(
  type: string,
  projection: Projection,
  origin: Cell,
  rotation = 0,
): { at: Pt; anchor: "start" | "middle" | "end"; onFace: boolean } | null {
  const footprint = symbolSchemas[type]?.["x-footprint"];
  const drawing = DRAWINGS[type];
  if (!footprint || !drawing) return null;
  if (drawing.labelOnFace && projection === "isometric") {
    const z = (origin.z ?? 0) + PIPE_AXIS_Z;
    const at = (p: Pt) => {
      const q = symbolPoint(origin, rotation, p);
      return project(projection, q.x, q.y, z);
    };
    const tip = at(LINK_TIP);
    const back = at(LINK_BACK);
    // The caption reads away from the arrow, whichever way it points.
    const left = tip.x < back.x;
    return {
      at: {
        x: tip.x + (left ? -LINK_LABEL_GAP : LINK_LABEL_GAP),
        y: tip.y + 4,
      },
      anchor: left ? "end" : "start",
      onFace: false,
    };
  }
  const top = symbolPlane(
    projection,
    origin,
    rotation,
    topOf(drawing, projection),
  );
  const { at, lift } = labelAnchor(drawing, projection, top, footprint);
  return {
    at: drawing.labelOnFace ? at : { x: at.x, y: at.y - lift },
    anchor: "middle",
    onFace: !!drawing.labelOnFace,
  };
}

/** Screen point the symbol's label sits at, where a readout hangs from.
 *  Null for a type the kit cannot draw. */
export function symbolLabelPoint(
  type: string,
  projection: Projection,
  origin: Cell,
  rotation = 0,
): Pt | null {
  return symbolLabelAnchor(type, projection, origin, rotation)?.at ?? null;
}

/** The fault mark of a symbol: its silhouette outlined in the fault's
 *  colour, and a badge at the top right of its footprint. The legend
 *  draws the badge alone. */
export function FaultMark({
  level,
  outline,
  badge,
}: {
  level: Severity;
  outline?: Pt[];
  badge: Pt;
}) {
  return (
    <g data-fault={level}>
      {outline && (
        <polygon
          points={pointsAttr(outline)}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className={`fill-none ${FAULT_STROKE_CLASS[level]}`}
        />
      )}
      <circle
        cx={badge.x}
        cy={badge.y}
        r={7}
        className={FAULT_FILL_CLASS[level]}
      />
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
    </g>
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
