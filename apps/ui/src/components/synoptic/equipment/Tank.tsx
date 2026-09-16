import { VesselLabel } from "./VesselLabel";

type TankProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** Height of the domed top. Defaults to a half-capsule. */
  domeH?: number;
  labelDy?: number;
};

/** Vertical tank with a domed top and flat bottom (e.g. hot water tank). */
export function Tank({ x, y, w, h, label, domeH, labelDy = 0 }: TankProps) {
  const dh = domeH ?? Math.min(w / 2, h * 0.3);
  const d = [
    `M ${x} ${y + dh}`,
    `A ${w / 2} ${dh} 0 0 1 ${x + w} ${y + dh}`,
    `L ${x + w} ${y + h - 4}`,
    `Q ${x + w} ${y + h} ${x + w - 4} ${y + h}`,
    `L ${x + 4} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - 4}`,
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
        <VesselLabel
          x={x + w / 2}
          y={y + dh + (h - dh) * 0.28 + labelDy}
          text={label}
        />
      )}
    </g>
  );
}
