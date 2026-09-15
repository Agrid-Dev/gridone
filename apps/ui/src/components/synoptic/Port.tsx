type PortProps = {
  /** Center of the connection diamond. */
  x: number;
  y: number;
  size?: number;
};

/** Diamond-shaped connection point drawn where a pipe meets equipment. */
export function Port({ x, y, size = 14 }: PortProps) {
  const h = size / 2;
  return (
    <path
      d={`M ${x} ${y - h} L ${x + h} ${y} L ${x} ${y + h} L ${x - h} ${y} Z`}
      strokeWidth={1.5}
      className="fill-card stroke-synoptic-stroke"
    />
  );
}
