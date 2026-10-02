import { useId } from "react";

/** Generic SVG building blocks for HVAC duct synoptics (AHUs, extractors,
 *  …): duct internals, value chips and air measurement tags. All
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

/** Which way the impeller turns. Blades are drawn for a clockwise fan and
 *  mirrored for a counter-clockwise one, so the curve always trails the
 *  rotation. */
export type FanSpin = "cw" | "ccw";

export function FanGlyph({
  cx,
  cy,
  spinning,
  spin = "cw",
  title,
}: {
  cx: number;
  cy: number;
  spinning: boolean;
  spin?: FanSpin;
  title: string;
}) {
  const sign = spin === "cw" ? 1 : -1;
  return (
    <g data-spinning={spinning} data-spin={spin}>
      <title>{title}</title>
      <circle
        cx={cx}
        cy={cy}
        r="24"
        strokeWidth="1.5"
        className="fill-card stroke-border"
      />
      {/* Blades are drawn around the local origin; the SMIL rotation is
          additive so it composes with the translate and spins in place. */}
      <g
        transform={`translate(${cx} ${cy}) scale(${sign} 1)`}
        className="fill-muted-foreground"
        fillOpacity={spinning ? 1 : 0.45}
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
        className="fill-card stroke-border"
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

/** Heating or cooling battery in the duct: a grey skeleton that fills with
 *  its colour from the bottom as the valve opens, so a closed coil reads as
 *  inert and a fully open one as fully coloured. The percentage readout is
 *  the caller's, placed with the other readouts below the duct. */
export function CoilGlyph({
  cx,
  ductY,
  colorClass,
  fillClass,
  title,
  opening,
}: {
  cx: number;
  ductY: number;
  /** Stroke colour of the filled tubes (`stroke-hvac-heat` / `-cool`). */
  colorClass: string;
  /** Fill colour of the filled region (`fill-hvac-heat` / `fill-hvac-cool`). */
  fillClass: string;
  title: string;
  /** Valve position in percent; null draws the bare skeleton. */
  opening: number | null | undefined;
}) {
  const clipId = useId();
  const x = cx - 14;
  const y = ductY + 4;
  const width = 28;
  const height = 48;
  const open = Math.min(Math.max(opening ?? 0, 0), 100) / 100;
  const fillHeight = height * open;
  const tubes = [-7, 0, 7].map((dx) => (
    <line
      key={dx}
      x1={cx + dx}
      y1={y + 5}
      x2={cx + dx}
      y2={y + height - 5}
      strokeWidth="1.5"
    />
  ));
  return (
    <g data-opening={open}>
      <title>{title}</title>
      <clipPath id={clipId}>
        <rect
          x={x}
          y={y + height - fillHeight}
          width={width}
          height={fillHeight}
        />
      </clipPath>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="2"
        strokeWidth="1.5"
        className="fill-card stroke-border"
      />
      <g className="stroke-muted-foreground" strokeOpacity={0.5}>
        {tubes}
      </g>
      {open > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx="2"
            fillOpacity={0.18}
            className={fillClass}
          />
          <g className={colorClass}>{tubes}</g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx="2"
            fill="none"
            strokeWidth="1.5"
            className={colorClass}
          />
        </g>
      )}
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
