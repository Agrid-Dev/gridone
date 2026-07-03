import { cn } from "@/lib/utils";

/** SVG building blocks shared by the AHU synoptics (single and double
 *  flux): ducts internals, value chips and air measurement tags. All
 *  coordinates are in the parent SVG's viewBox space. */

export function FlowChevron({
  x,
  cy,
  dir,
}: {
  x: number;
  cy: number;
  dir: "left" | "right";
}) {
  const tip = dir === "left" ? x - 6 : x + 6;
  const base = dir === "left" ? x + 6 : x - 6;
  return (
    <path
      d={`M ${base} ${cy - 8} L ${tip} ${cy} L ${base} ${cy + 8}`}
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-muted-foreground"
    />
  );
}

export function FanGlyph({
  cx,
  cy,
  spinning,
  title,
}: {
  cx: number;
  cy: number;
  spinning: boolean;
  title: string;
}) {
  return (
    <g>
      <title>{title}</title>
      <circle
        cx={cx}
        cy={cy}
        r="24"
        strokeWidth="1.5"
        className="fill-background stroke-border"
      />
      {/* Blades are drawn around the local origin; the SMIL rotation is
          additive so it composes with the translate and spins in place. */}
      <g
        transform={`translate(${cx} ${cy})`}
        className={spinning ? "fill-hvac-fan" : "fill-muted-foreground"}
      >
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle})`}
            d="M0 -4 C7 -7 8 -17 0 -20 C-8 -17 -7 -7 0 -4 Z"
          />
        ))}
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="2.6s"
            repeatCount="indefinite"
            additive="sum"
          />
        )}
      </g>
      <circle cx={cx} cy={cy} r="3.5" className="fill-border" />
    </g>
  );
}

export function FilterGlyph({
  x,
  cy,
  title,
}: {
  x: number;
  cy: number;
  title: string;
}) {
  const mid = x + 13;
  const zigzag = [-22, -15, -8, -1, 6, 13, 20]
    .map((dy, i) => `${i % 2 === 0 ? mid - 5 : mid + 5},${cy + dy}`)
    .join(" ");
  return (
    <g>
      <title>{title}</title>
      <rect
        x={x}
        y={cy - 26}
        width="26"
        height="52"
        rx="3"
        className="fill-background stroke-border"
      />
      <polyline
        points={zigzag}
        fill="none"
        strokeWidth="1.5"
        className="stroke-muted-foreground"
      />
    </g>
  );
}

/** Heating or cooling battery in the supply duct, with its valve position
 *  tagged below the duct. */
export function CoilGlyph({
  cx,
  ductY,
  colorClass,
  title,
  valve,
}: {
  cx: number;
  ductY: number;
  colorClass: string;
  title: string;
  valve: string;
}) {
  const y = ductY + 4;
  return (
    <g>
      <title>{title}</title>
      <rect
        x={cx - 14}
        y={y}
        width="28"
        height="48"
        rx="2"
        strokeWidth="1.5"
        className={cn("fill-background", colorClass)}
      />
      {[-7, 0, 7].map((dx) => (
        <line
          key={dx}
          x1={cx + dx}
          y1={y + 5}
          x2={cx + dx}
          y2={y + 43}
          strokeWidth="1.5"
          className={colorClass}
        />
      ))}
      <line
        x1={cx}
        y1={ductY + 56}
        x2={cx}
        y2={ductY + 73}
        strokeWidth="1.5"
        className="stroke-border"
      />
      <ValueChip cx={cx} cy={ductY + 84} w={46} title={title} value={valve} />
    </g>
  );
}

export function ValueChip({
  cx,
  cy,
  value,
  title,
  w = 56,
}: {
  cx: number;
  cy: number;
  value: string;
  title: string;
  w?: number;
}) {
  return (
    <g>
      <title>{title}</title>
      <rect
        x={cx - w / 2}
        y={cy - 11}
        width={w}
        height="22"
        rx="11"
        className="fill-background stroke-border"
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-semibold"
      >
        {value}
      </text>
    </g>
  );
}

export function MeasureTag({
  cx,
  y,
  w,
  lineY,
  labelText,
  value,
}: {
  cx: number;
  y: number;
  w: number;
  lineY: [number, number];
  labelText: string;
  value: string;
}) {
  return (
    <g>
      <line
        x1={cx}
        y1={lineY[0]}
        x2={cx}
        y2={lineY[1]}
        strokeWidth="1.5"
        className="stroke-border"
      />
      <rect
        x={cx - w / 2}
        y={y}
        width={w}
        height="38"
        rx="7"
        className="fill-background stroke-border"
      />
      <text
        x={cx}
        y={y + 15}
        textAnchor="middle"
        className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wider"
      >
        {labelText}
      </text>
      <text
        x={cx}
        y={y + 31}
        textAnchor="middle"
        className="fill-foreground text-[13px] font-semibold"
      >
        {value}
      </text>
    </g>
  );
}
