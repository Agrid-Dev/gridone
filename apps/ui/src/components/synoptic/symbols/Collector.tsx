import type { Cell, Projection } from "@gridone/sdk";
import { PIPE_AXIS_Z, planeAt } from "../projection";
import { square } from "./extrude";
import { Label } from "./Label";
import { PlanPoly } from "./plan";
import type { CollectorProps } from "./ports";

type Props = {
  projection: Projection;
  origin: Cell;
  shape: CollectorProps;
  label?: string;
};

const BAR_WIDTH = 0.4;
const LABEL_LIFT = 14;

/** The collector bar on the pipe axis plane, its length and ports authored
 *  per instance. Runs attach at the ports `symbolPort` resolves. */
export function Collector({ projection, origin, shape, label }: Props) {
  const plane = planeAt(projection, (origin.z ?? 0) + PIPE_AXIS_Z);
  const inset = (1 - BAR_WIDTH) / 2;
  const bar =
    shape.axis === "x"
      ? square(origin.x, origin.y + inset, shape.length, BAR_WIDTH)
      : square(origin.x + inset, origin.y, BAR_WIDTH, shape.length);
  const at = plane(origin.x + 0.5, origin.y + 0.5);
  return (
    <g>
      <PlanPoly plane={plane} points={bar} cls="face" />
      {label && <Label text={label} at={at} lift={LABEL_LIFT} />}
    </g>
  );
}
