import { VesselLabel } from "./VesselLabel";

type MixerProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  labelDy?: number;
};

/** Mixing funnel: wide receiving top tapering to a narrow discharge neck. */
export function Mixer({ x, y, w, h, label, labelDy = 0 }: MixerProps) {
  const r = 8;
  const bodyH = h * 0.22;
  const neckW = w * 0.3;
  const stubH = h * 0.12;
  const cx = x + w / 2;
  const d = [
    `M ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + bodyH}`,
    `L ${cx + neckW / 2} ${y + h - stubH}`,
    `L ${cx + neckW / 2} ${y + h}`,
    `L ${cx - neckW / 2} ${y + h}`,
    `L ${cx - neckW / 2} ${y + h - stubH}`,
    `L ${x} ${y + bodyH}`,
    "Z",
  ].join(" ");
  return (
    <g>
      <path
        d={d}
        strokeWidth={2}
        className="fill-synoptic-body stroke-synoptic-stroke"
      />
      {label && <VesselLabel x={cx} y={y + h * 0.42 + labelDy} text={label} />}
    </g>
  );
}
