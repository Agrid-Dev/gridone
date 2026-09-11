type ReadoutProps = {
  /** Top-left of the value box. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  value: string | number;
  unit?: string;
  /** Small caption above the box. */
  label?: string;
};

/** Digital value box. */
export function Readout({
  x,
  y,
  w = 112,
  h = 32,
  value,
  unit,
  label,
}: ReadoutProps) {
  return (
    <g>
      {label && (
        <text x={x} y={y - 9} fontSize={12.5} className="fill-muted-foreground">
          {label}
        </text>
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        strokeWidth={1.5}
        className="fill-card stroke-border"
      />
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fontWeight={600}
        className="fill-foreground"
      >
        {value}
        {unit ? ` ${unit}` : ""}
      </text>
    </g>
  );
}
