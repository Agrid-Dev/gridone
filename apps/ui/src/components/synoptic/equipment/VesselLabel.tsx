/** Bold label rendered on the face of a vessel. */
export function VesselLabel({
  x,
  y,
  text,
  size = 20,
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={700}
      className="fill-foreground"
    >
      {text}
    </text>
  );
}
