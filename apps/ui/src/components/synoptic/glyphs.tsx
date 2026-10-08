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

export const FILTER_WIDTH = 26;

/** Filter in the duct: the zigzag media in a frame. A clogged filter turns
 *  alert red (the state is a fault on the device) so the eye finds the one
 *  to change. */
export function FilterGlyph({
  x,
  cy,
  title,
  clogged = false,
  width = FILTER_WIDTH,
}: {
  x: number;
  cy: number;
  title: string;
  /** Clogged (differential-pressure switch tripped); null/false is clean. */
  clogged?: boolean | null;
  width?: number;
}) {
  const mid = x + width / 2;
  const amplitude = width / 2 - 8;
  const zigzag = [-22, -15, -8, -1, 6, 13, 20]
    .map(
      (dy, i) =>
        `${i % 2 === 0 ? mid - amplitude : mid + amplitude},${cy + dy}`,
    )
    .join(" ");
  return (
    <g data-clogged={clogged === true}>
      <title>{title}</title>
      <rect
        x={x}
        y={cy - 26}
        width={width}
        height="52"
        rx="3"
        strokeWidth={clogged ? 1.5 : 1}
        fillOpacity={clogged ? 0.12 : 1}
        className={
          clogged
            ? "fill-status-error stroke-status-error"
            : "fill-card stroke-border"
        }
      />
      <polyline
        points={zigzag}
        fill="none"
        strokeWidth="1.5"
        className={clogged ? "stroke-status-error" : "stroke-muted-foreground"}
      />
    </g>
  );
}

/** Motorised damper in the duct, side view: three blades on their pivots.
 *  Open blades lie along the air (horizontal), closed ones stand across it;
 *  an unknown state draws them half-way, muted. */
export function DamperGlyph({
  cx,
  cy,
  open,
  title,
}: {
  cx: number;
  cy: number;
  /** Limit-switch state; null when the unit does not report it. */
  open: boolean | null | undefined;
  title: string;
}) {
  const angle = open == null ? 45 : open ? 0 : 90;
  const blade = 7;
  return (
    <g data-open={open == null ? "unknown" : String(open)}>
      <title>{title}</title>
      <line
        x1={cx}
        y1={cy - 26}
        x2={cx}
        y2={cy + 26}
        strokeWidth="1"
        strokeDasharray="2 2"
        className="stroke-border"
      />
      {[-16, 0, 16].map((dy) => (
        <g key={dy} transform={`translate(${cx} ${cy + dy}) rotate(${angle})`}>
          <line
            x1={-blade}
            y1={0}
            x2={blade}
            y2={0}
            strokeWidth="2.5"
            strokeLinecap="round"
            className={
              open == null ? "stroke-muted-foreground" : "stroke-foreground"
            }
            strokeOpacity={open == null ? 0.5 : 1}
          />
          <circle r="1.8" className="fill-border" />
        </g>
      ))}
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

/** Pipes of a coil loop stand this far either side of the coil's centre. */
export const COIL_LOOP_PIPE_DX = 16;
/** Values written on the pipes: a size down from the readouts, since two
 *  loops can sit a coil's width apart. */
const LOOP_TEXT_CLASS =
  "fill-foreground font-mono text-[10px] font-semibold tabular-nums";

/** The water side of a coil, drawn under the duct: an inlet pipe (up, into
 *  the coil) and an outlet pipe (down, out of it) in the coil's colour, the
 *  control valve on the inlet with its opening beside it, and the water
 *  temperatures written on their pipes — the inlet high on the left, the
 *  outlet low on the right, so two loops side by side never share a line.
 *  Pipes stay muted while the valve is shut so a closed loop reads as
 *  idle. */
export function CoilLoopGlyph({
  cx,
  y,
  height,
  colorClass,
  fillClass,
  active,
  title,
  valve,
  inlet,
  outlet,
}: {
  cx: number;
  /** Bottom edge of the duct. */
  y: number;
  height: number;
  colorClass: string;
  fillClass: string;
  /** Whether water circulates (valve open): colours the pipes. */
  active: boolean;
  title: string;
  /** The control valve's opening, as text ("80 %"), and in [0, 1]. */
  valve?: { text: string; opening: number };
  /** Water temperature entering the coil, as text. */
  inlet?: string;
  /** Water temperature leaving the coil, as text. */
  outlet?: string;
}) {
  const stroke = active ? colorClass : "stroke-muted-foreground";
  const inX = cx - COIL_LOOP_PIPE_DX;
  const outX = cx + COIL_LOOP_PIPE_DX;
  const bottom = y + height;
  const inletY = y + 30;
  const outletY = bottom - 14;
  const valveY = y + 56;
  const head = (tipY: number, dir: 1 | -1, x: number) =>
    `M ${x - 4} ${tipY - dir * 6} L ${x} ${tipY} L ${x + 4} ${tipY - dir * 6}`;
  return (
    <g data-active={active}>
      <title>{title}</title>
      <g className={stroke} strokeOpacity={active ? 1 : 0.5}>
        <line x1={inX} y1={bottom} x2={inX} y2={y} strokeWidth="2.5" />
        <path
          d={head(y + 8, -1, inX)}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <line
          x1={outX}
          y1={y}
          x2={outX}
          y2={bottom}
          strokeWidth="2.5"
          strokeDasharray="6 3"
        />
        <path
          d={head(bottom, 1, outX)}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
      {valve && (
        <g data-opening={valve.opening}>
          {/* Two-way valve on the inlet: a bowtie, filled as it opens, with
              its actuator stem. */}
          <path
            d={`M ${inX - 7} ${valveY - 6} L ${inX} ${valveY} L ${inX - 7} ${valveY + 6} Z M ${inX + 7} ${valveY - 6} L ${inX} ${valveY} L ${inX + 7} ${valveY + 6} Z`}
            strokeWidth="1.5"
            strokeLinejoin="round"
            fillOpacity={valve.opening > 0 ? 0.9 : 0}
            className={
              valve.opening > 0
                ? `${fillClass} ${colorClass}`
                : "fill-card stroke-muted-foreground"
            }
          />
          <line
            x1={inX}
            y1={valveY}
            x2={inX}
            y2={valveY - 11}
            strokeWidth="1.5"
            className="stroke-muted-foreground"
          />
          <line
            x1={inX - 4}
            y1={valveY - 11}
            x2={inX + 4}
            y2={valveY - 11}
            strokeWidth="1.5"
            className="stroke-muted-foreground"
          />
          <text
            x={inX - 13}
            y={valveY + 4}
            textAnchor="end"
            className={LOOP_TEXT_CLASS}
          >
            {valve.text}
          </text>
        </g>
      )}
      {inlet && (
        <text
          x={inX - 7}
          y={inletY}
          textAnchor="end"
          className={LOOP_TEXT_CLASS}
        >
          {inlet}
        </text>
      )}
      {outlet && (
        <text x={outX + 7} y={outletY} className={LOOP_TEXT_CLASS}>
          {outlet}
        </text>
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
