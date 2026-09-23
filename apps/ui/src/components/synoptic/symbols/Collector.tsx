import type { ReactNode } from "react";
import type { Cell, Projection } from "@gridone/sdk";
import {
  axisAngle,
  isoEllipse,
  PIPE_AXIS_Z,
  planeAt,
  project,
} from "../projection";
import type { Pt } from "../types";
import { square } from "./extrude";
import { Label, LABEL_SIZE } from "./Label";
import { PlanPoly } from "./plan";
import type { CollectorProps } from "./ports";
import { IsoTube, type Space } from "./volume";

type Props = {
  projection: Projection;
  origin: Cell;
  shape: CollectorProps;
  label?: string;
};

const BAR_WIDTH = 0.4;
/** How far the bar sits in from the faces its ports leave through. */
export const COLLECTOR_INSET = (1 - BAR_WIDTH) / 2;
/** Radius of the bar's tube in the isometric view. */
const BAR_R = 0.2;
/** A flat label sits this far above the bar's origin cell. */
export const COLLECTOR_LABEL_LIFT = 14;
/** An isometric label lies along the bar, this many cells above the axis. */
const ISO_LABEL_Z = 0.55;

/** The direction the bar runs, in plan. */
const axisOf = (shape: CollectorProps): Pt =>
  shape.axis === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 };

/** The cells of the bar, from its origin along its axis. */
export function collectorCells(origin: Cell, shape: CollectorProps): Cell[] {
  const d = axisOf(shape);
  return Array.from({ length: shape.length }, (_, i) => ({
    x: origin.x + d.x * i,
    y: origin.y + d.y * i,
    z: origin.z,
  }));
}

/**
 * The bar cut per cell, so each piece carries its own depth and a run
 * raised over the bar paints over the cells it crosses and under none of
 * the others. On the sheet each piece is its share of the flat bar; in
 * the isometric view a length of tube on the pipe axis, capped at both
 * ends of the bar.
 */
export function collectorPieces(
  projection: Projection,
  origin: Cell,
  shape: CollectorProps,
): { cell: Cell; node: ReactNode }[] {
  const z = (origin.z ?? 0) + PIPE_AXIS_Z;
  const d = axisOf(shape);
  const cells = collectorCells(origin, shape);
  if (projection === "flat") {
    const plane = planeAt(projection, z);
    return cells.map((cell) => ({
      cell,
      node: (
        <PlanPoly
          plane={plane}
          points={
            shape.axis === "x"
              ? square(cell.x, cell.y + COLLECTOR_INSET, 1, BAR_WIDTH)
              : square(cell.x + COLLECTOR_INSET, cell.y, BAR_WIDTH, 1)
          }
          cls="face"
        />
      ),
    }));
  }
  const P: Space = (x, y, dz) => project(projection, x, y, dz);
  const last = cells.length - 1;
  return cells.map((cell, i) => {
    const from: [number, number, number] = [
      cell.x + 0.5 - (i === 0 ? 0 : d.x / 2),
      cell.y + 0.5 - (i === 0 ? 0 : d.y / 2),
      z,
    ];
    const to: [number, number, number] = [
      cell.x + 0.5 + (i === last ? 0 : d.x / 2),
      cell.y + 0.5 + (i === last ? 0 : d.y / 2),
      z,
    ];
    return {
      cell,
      node: (
        <g data-collector-cell>
          <IsoTube P={P} from={from} to={to} r={BAR_R} caps="butt" />
          {(i === 0 || i === last) && (
            <EndCap P={P} at={i === 0 ? from : to} axis={shape.axis} />
          )}
        </g>
      ),
    };
  });
}

/** The dark end of the tube, an ellipse turned to the bar's axis. */
function EndCap({
  P,
  at,
  axis,
}: {
  P: Space;
  at: [number, number, number];
  axis: "x" | "y";
}) {
  const p = P(...at);
  const { rx, ry } = isoEllipse(BAR_R);
  const angle = axisAngle("isometric", axisOf({ axis, length: 1, ports: {} }));
  return (
    <ellipse
      cx={p.x}
      cy={p.y}
      rx={ry * 0.9}
      ry={rx * 0.55}
      strokeWidth={1}
      className="fill-synoptic-dark stroke-synoptic-edge"
      transform={`rotate(${angle} ${p.x} ${p.y})`}
    />
  );
}

/** Where a collector's label starts and how it turns: along the bar in
 *  the isometric view, level above its origin cell on the sheet. */
export function collectorLabelAnchor(
  projection: Projection,
  origin: Cell,
  shape: CollectorProps,
): { at: Pt; angle: number; anchor: "start" | "middle" } {
  const z = origin.z ?? 0;
  if (projection === "flat") {
    const p = planeAt(projection, z + PIPE_AXIS_Z)(
      origin.x + 0.5,
      origin.y + 0.5,
    );
    return {
      at: { x: p.x, y: p.y - COLLECTOR_LABEL_LIFT },
      angle: 0,
      anchor: "middle",
    };
  }
  const d = axisOf(shape);
  // The text starts a third of a cell in from the bar's origin end and
  // reads along the axis, above the tube.
  const at = project(
    projection,
    origin.x + 0.5 + d.x * 0.3,
    origin.y + 0.5 + d.y * 0.3,
    z + PIPE_AXIS_Z + ISO_LABEL_Z,
  );
  return { at, angle: axisAngle(projection, d), anchor: "start" };
}

/** The collector's name: along the bar in the isometric view, as the
 *  reference draws it, level above the bar on the sheet. */
export function CollectorLabel({
  projection,
  origin,
  shape,
  label,
}: Required<Props>) {
  const { at, angle, anchor } = collectorLabelAnchor(projection, origin, shape);
  if (angle === 0) {
    return <Label text={label} at={at} lift={0} />;
  }
  return (
    <text
      x={at.x}
      y={at.y}
      textAnchor={anchor}
      fontSize={LABEL_SIZE}
      fontWeight={600}
      letterSpacing={0.3}
      className="fill-muted-foreground"
      transform={`rotate(${Math.round(angle * 100) / 100} ${at.x} ${at.y})`}
      data-axis-label
    >
      {label}
    </text>
  );
}

/** The whole collector bar with its label, for a sheet or a palette that
 *  needs no depth ordering. Runs attach at the ports `symbolPort` resolves. */
export function Collector({ projection, origin, shape, label }: Props) {
  return (
    <g>
      {collectorPieces(projection, origin, shape).map(({ cell, node }) => (
        <g key={`${cell.x},${cell.y}`}>{node}</g>
      ))}
      {label && (
        <CollectorLabel
          projection={projection}
          origin={origin}
          shape={shape}
          label={label}
        />
      )}
    </g>
  );
}
