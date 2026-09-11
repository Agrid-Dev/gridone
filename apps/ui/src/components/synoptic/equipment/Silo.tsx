import { COLORS, VesselLabel } from "../theme";

type SiloProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** Fraction of the height where the bottom cone starts. */
  coneRatio?: number;
  /** Width of the flat discharge tip at the bottom. */
  tipW?: number;
  /** Rounding radius of the top corners. */
  topR?: number;
  labelDy?: number;
};

/** Storage silo / hopper: straight body converging to a bottom discharge tip. */
export function Silo({
  x,
  y,
  w,
  h,
  label,
  coneRatio = 0.55,
  tipW = 12,
  topR = 14,
  labelDy = 0,
}: SiloProps) {
  const coneY = y + h * coneRatio;
  const cx = x + w / 2;
  const d = [
    `M ${x} ${coneY}`,
    `L ${x} ${y + topR}`,
    `Q ${x} ${y} ${x + topR} ${y}`,
    `L ${x + w - topR} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + topR}`,
    `L ${x + w} ${coneY}`,
    `L ${cx + tipW / 2} ${y + h}`,
    `L ${cx - tipW / 2} ${y + h}`,
    "Z",
  ].join(" ");
  return (
    <g>
      <path
        d={d}
        fill="url(#scada-metal)"
        stroke={COLORS.metalStroke}
        strokeWidth={1}
        strokeOpacity={0.5}
      />
      {label && <VesselLabel x={cx} y={y + h * 0.5 + labelDy} text={label} />}
    </g>
  );
}
