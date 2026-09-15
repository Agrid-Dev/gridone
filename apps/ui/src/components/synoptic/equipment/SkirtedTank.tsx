import { VesselLabel } from "./VesselLabel";

type SkirtedTankProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  labelDy?: number;
};

/** Process vessel / heat exchanger standing on a skirt (two bottom feet). */
export function SkirtedTank({
  x,
  y,
  w,
  h,
  label,
  labelDy = 0,
}: SkirtedTankProps) {
  const r = 12;
  const legW = 20;
  const notchH = 16;
  const d = [
    `M ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    `L ${x + w - legW} ${y + h}`,
    `L ${x + w - legW} ${y + h - notchH}`,
    `L ${x + legW} ${y + h - notchH}`,
    `L ${x + legW} ${y + h}`,
    `L ${x} ${y + h}`,
    "Z",
  ].join(" ");
  return (
    <g>
      <path
        d={d}
        strokeWidth={2}
        className="fill-synoptic-body stroke-synoptic-stroke"
      />
      {label && (
        <VesselLabel x={x + w / 2} y={y + h * 0.5 + labelDy} text={label} />
      )}
    </g>
  );
}
