import { COLORS } from "../theme";
import type { Pt } from "../types";

type InstrumentLinkProps = {
  from: Pt;
  to: Pt;
  /** Optional control point bending the curve. Defaults to a straight-ish midpoint. */
  via?: Pt;
  color?: string;
};

/** Dotted signal line between a monitor/controller and the device it drives. */
export function InstrumentLink({
  from,
  to,
  via,
  color = COLORS.instrument,
}: InstrumentLinkProps) {
  const c = via ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return (
    <path
      d={`M ${from.x} ${from.y} Q ${c.x} ${c.y} ${to.x} ${to.y}`}
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeDasharray="0.5 7"
      strokeLinecap="round"
    />
  );
}
