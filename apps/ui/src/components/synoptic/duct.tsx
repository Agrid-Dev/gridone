import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FlowChevron } from "./glyphs";

/** Instrumented duct primitives for the air-handling synoptics (AHUs,
 *  extractors): a duct run with its airflow, the readouts anchored to the
 *  equipment they measure, and the stream blocks at the duct ends. All
 *  coordinates are in the parent SVG's viewBox space.
 *
 *  Conventions, in the spirit of a BMS faceplate / P&ID:
 *  - a value sits where it is measured (fan speed under the fan, valve
 *    opening under the coil, stream properties at the duct end);
 *  - a setpoint sits next to its process value and is edited in place;
 *  - readouts use tabular mono numerals so columns of values line up. */

export type FlowDir = "right" | "left";

export const DUCT_HEIGHT = 56;

/** Dash period of the airflow centerline; the animation shifts by one
 *  period per cycle so the loop is seamless. */
const FLOW_PERIOD = 16;

/** Centerline cycle duration: slow at a trickle, brisk at full speed. */
function flowCycleSeconds(speed: number): string {
  const ratio = Math.min(Math.max(speed, 0), 100) / 100;
  return `${(2.4 - 1.8 * ratio).toFixed(2)}s`;
}

type DuctProps = {
  x: number;
  y: number;
  width: number;
  dir: FlowDir;
  /** Fan speed in percent; null/0 draws a still duct. */
  speed: number | null | undefined;
};

/** A straight duct run: open-ended walls, a direction chevron at each end,
 *  and a dashed centerline that marches with the air when a fan runs. The
 *  internals (filter, coils, fans) draw over the centerline. */
export function Duct({ x, y, width, dir, speed }: DuctProps) {
  const cy = y + DUCT_HEIGHT / 2;
  const running = (speed ?? 0) > 0;
  const shift = dir === "right" ? -FLOW_PERIOD : FLOW_PERIOD;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={DUCT_HEIGHT}
        className="fill-muted"
      />
      <line
        x1={x + 24}
        y1={cy}
        x2={x + width - 24}
        y2={cy}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`3 ${FLOW_PERIOD - 3}`}
        strokeOpacity={running ? 0.55 : 0.25}
        className="stroke-muted-foreground"
      >
        {running && (
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to={String(shift)}
            dur={flowCycleSeconds(speed ?? 0)}
            repeatCount="indefinite"
          />
        )}
      </line>
      {[y, y + DUCT_HEIGHT].map((wall) => (
        <line
          key={wall}
          x1={x}
          y1={wall}
          x2={x + width}
          y2={wall}
          strokeWidth="1.5"
          className="stroke-border"
        />
      ))}
      <FlowChevron x={x + 12} cy={cy} dir={dir} />
      <FlowChevron x={x + width - 12} cy={cy} dir={dir} />
    </g>
  );
}

type ReadoutProps = {
  cx: number;
  /** Baseline of the label; the value sits one line below. */
  y: number;
  label: string;
  value: string;
  /** Tints the value (e.g. the coil colour); defaults to the foreground. */
  valueClass?: string;
  /** A worded state ("Flow proven") rather than a number: set in the text
   *  face, not the numeral one. */
  textual?: boolean;
};

/** A labelled value under (or over) the equipment it belongs to. */
export function Readout({
  cx,
  y,
  label,
  value,
  valueClass,
  textual = false,
}: ReadoutProps) {
  return (
    <g>
      <text
        x={cx}
        y={y}
        textAnchor="middle"
        className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wider"
      >
        {label}
      </text>
      <text
        x={cx}
        y={y + 17}
        textAnchor="middle"
        className={cn(
          textual
            ? "text-[13px] font-semibold"
            : "font-mono text-[14px] font-semibold tabular-nums",
          valueClass ?? "fill-foreground",
        )}
      >
        {value}
      </text>
    </g>
  );
}

/** Letter in an instrument bubble: what the row measures (ISA style). */
export type InstrumentKind = "T" | "P" | "FS";

export type StreamRow = {
  kind: InstrumentKind;
  /** Accessible name of the measure ("Supply air temperature"). */
  title: string;
  value: string;
  setpoint?: {
    label: string;
    value: string;
    /** When set, the setpoint is a button that opens its editor. */
    onEdit?: () => void;
    /** Accessible name of the edit button ("Edit supply temperature"). */
    editLabel: string;
  };
};

const ROW_HEIGHT = 20;
const SETPOINT_WIDTH = 128;

type StreamBlockProps = {
  /** Left edge of the block. */
  x: number;
  /** Vertical centre: the duct's centreline. */
  cy: number;
  title: string;
  rows: StreamRow[];
};

/** The properties of an air stream, in line with the duct end it enters or
 *  leaves by: a title, then one row per measure (instrument bubble + value)
 *  with its setpoint, when the unit has one, on the next row. */
export function StreamBlock({ x, cy, title, rows }: StreamBlockProps) {
  const lines = rows.reduce((n, row) => n + (row.setpoint ? 2 : 1), 0);
  const top = cy - (lines * ROW_HEIGHT) / 2;
  let line = 0;
  return (
    <g>
      <text
        x={x}
        y={top - 8}
        className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-wider"
      >
        {title}
      </text>
      {rows.map((row) => {
        const baseline = top + 14 + line++ * ROW_HEIGHT;
        const setpointTop = top + 2 + line * ROW_HEIGHT;
        if (row.setpoint) line++;
        return (
          <g key={row.kind}>
            <g>
              <title>{row.title}</title>
              <circle
                cx={x + 8}
                cy={baseline - 4}
                r="7.5"
                strokeWidth="1"
                className="fill-card stroke-muted-foreground"
              />
              <text
                x={x + 8}
                y={baseline - 1}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px] font-bold"
              >
                {row.kind}
              </text>
              <text
                x={x + 22}
                y={baseline}
                className="fill-foreground font-mono text-[14px] font-semibold tabular-nums"
              >
                {row.value}
              </text>
            </g>
            {row.setpoint && (
              <SetpointPill x={x} y={setpointTop} {...row.setpoint} />
            )}
          </g>
        );
      })}
    </g>
  );
}

type SetpointPillProps = {
  x: number;
  y: number;
} & NonNullable<StreamRow["setpoint"]>;

/** A setpoint next to its process value. Dashed, as a target rather than a
 *  measure; a writable one is a button that opens the editor and shows a
 *  pencil, a read-only one is plain text. */
function SetpointPill({
  x,
  y,
  label,
  value,
  onEdit,
  editLabel,
}: SetpointPillProps) {
  const height = ROW_HEIGHT - 3;
  const content = (
    <>
      <rect
        x={x}
        y={y}
        width={SETPOINT_WIDTH}
        height={height}
        rx="4"
        strokeWidth="1"
        strokeDasharray="3 2"
        className={cn(
          "fill-card stroke-border",
          onEdit && "transition-colors group-hover:stroke-primary",
        )}
      />
      <text
        x={x + 7}
        y={y + 12.5}
        className="fill-muted-foreground text-[9px] font-medium uppercase tracking-wider"
      >
        {label}
      </text>
      <text
        x={x + SETPOINT_WIDTH - (onEdit ? 20 : 7)}
        y={y + 13}
        textAnchor="end"
        className="fill-foreground font-mono text-[12px] font-semibold tabular-nums"
      >
        {value}
      </text>
      {onEdit && <PencilGlyph x={x + SETPOINT_WIDTH - 15} y={y + 3.5} />}
    </>
  );
  if (!onEdit) return <g>{content}</g>;
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit();
    }
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={editLabel}
      onClick={onEdit}
      onKeyDown={onKeyDown}
      className="group cursor-pointer outline-none focus-visible:[&>rect]:stroke-primary"
    >
      {content}
    </g>
  );
}

/** lucide `pencil` at 10px, drawn from its 24-unit grid. */
function PencilGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(0.42)`}
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-muted-foreground transition-colors group-hover:stroke-primary"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </g>
  );
}

type ExchangerProps = {
  cx: number;
  /** Top and bottom edges: it spans both ducts with a margin. */
  y: number;
  height: number;
  title: string;
  /** Readout drawn at the block's centre, between the two ducts. */
  readout: { label: string; value: string };
};

const EXCHANGER_WIDTH = 104;

/** Heat-recovery exchanger (generic — plate or wheel): the block where the
 *  extract and supply streams cross, drawn as the crossed-diagonals symbol
 *  with its efficiency readout at the crossing. */
export function ExchangerGlyph({
  cx,
  y,
  height,
  title,
  readout,
}: ExchangerProps) {
  const x = cx - EXCHANGER_WIDTH / 2;
  const cy = y + height / 2;
  return (
    <g>
      <title>{title}</title>
      <rect
        x={x}
        y={y}
        width={EXCHANGER_WIDTH}
        height={height}
        rx="3"
        strokeWidth="1.5"
        className="fill-card stroke-border"
      />
      {[
        [x, y, x + EXCHANGER_WIDTH, y + height],
        [x + EXCHANGER_WIDTH, y, x, y + height],
      ].map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          strokeWidth="1.5"
          className="stroke-muted-foreground"
        />
      ))}
      <rect
        x={cx - 34}
        y={cy - 18}
        width="68"
        height="36"
        rx="4"
        className="fill-card"
      />
      <Readout cx={cx} y={cy - 6} {...readout} />
    </g>
  );
}

/** Small uppercase caption with no value — names a stream at a duct end
 *  the unit has no measure for. */
export function DuctCaption({
  x,
  cy,
  text,
}: {
  x: number;
  cy: number;
  text: string;
}) {
  return (
    <text
      x={x}
      y={cy + 4}
      className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-wider"
    >
      {text}
    </text>
  );
}

/** The chrome every air-handling synoptic shares: the status rail above the
 *  drawing and the card around both. */
export function SynopticCard({
  rail,
  children,
  className,
}: {
  rail?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      {rail}
      {children}
    </div>
  );
}
