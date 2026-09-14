import { SEMANTIC_FILL_CLASS } from "@/lib/semanticColors";
import type { MonitorRow, Status } from "../types";

type MonitorPanelProps = {
  /** Top-left corner of the panel. */
  x: number;
  y: number;
  title: string;
  /** Indicator squares shown under the title. */
  statuses: Status[];
  /** Value rows (typically SV / PV / OP). */
  rows: MonitorRow[];
  w?: number;
};

const SQ = 24;
const PAD = 10;
const LABEL_W = 30;
const UNIT_W = 50;
/** Narrower than this the label, box and unit columns cannot fit. */
const MIN_W = PAD + LABEL_W + UNIT_W + 20;
const ROW_H = 33;

/** Height of a panel for a given number of rows (useful to anchor instrument links). */
export function monitorPanelHeight(rowCount: number): number {
  return 66 + rowCount * ROW_H + 10;
}

/**
 * Controller faceplate: title, status squares and labelled value rows.
 * Fully prop-driven so live BMS values can be bound directly.
 */
export function MonitorPanel({
  x,
  y,
  title,
  statuses,
  rows,
  w = 162,
}: MonitorPanelProps) {
  const h = monitorPanelHeight(rows.length);
  // Everything after the label is laid out from the width: the value box
  // takes what the label and unit columns leave, indicators past the right
  // edge are not drawn.
  const width = Math.max(w, MIN_W);
  const boxX = x + PAD + LABEL_W;
  const boxW = width - PAD - LABEL_W - UNIT_W;
  const shownStatuses = statuses.slice(
    0,
    Math.floor((width - 2 * PAD + 5) / (SQ + 5)),
  );
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={h}
        strokeWidth={1.5}
        className="fill-card stroke-border"
      />
      <text
        x={x + width / 2}
        y={y + 18}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        className="fill-foreground"
      >
        {title}
      </text>
      {shownStatuses.map((s, i) => (
        <rect
          key={i}
          x={x + PAD + i * (SQ + 5)}
          y={y + 34}
          width={SQ}
          height={SQ}
          className={
            s === "off" ? "fill-muted-foreground" : SEMANTIC_FILL_CLASS[s]
          }
        />
      ))}
      {rows.map((row, i) => {
        const cy = y + 66 + i * ROW_H + ROW_H / 2 - 3;
        return (
          <g key={i}>
            <text
              x={x + PAD}
              y={cy}
              dominantBaseline="central"
              fontSize={15}
              className="fill-muted-foreground"
            >
              {row.label}
            </text>
            <rect
              x={boxX}
              y={cy - 13}
              width={boxW}
              height={26}
              strokeWidth={1.5}
              className="fill-background stroke-border"
            />
            <text
              x={boxX + boxW / 2}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={15}
              className="fill-foreground"
            >
              {row.value}
            </text>
            <text
              x={x + width - UNIT_W + 6}
              y={cy}
              dominantBaseline="central"
              fontSize={13.5}
              className="fill-muted-foreground"
            >
              {row.unit}
            </text>
          </g>
        );
      })}
    </g>
  );
}
