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
  return (
    <g>
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
        y={y + 18}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        className="fill-foreground"
      >
        {title}
      </text>
      {statuses.map((s, i) => (
        <rect
          key={i}
          x={x + 10 + i * (SQ + 5)}
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
              x={x + 10}
              y={cy}
              dominantBaseline="central"
              fontSize={15}
              className="fill-muted-foreground"
            >
              {row.label}
            </text>
            <rect
              x={x + 40}
              y={cy - 13}
              width={72}
              height={26}
              strokeWidth={1.5}
              className="fill-background stroke-border"
            />
            <text
              x={x + 40 + 36}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={15}
              className="fill-foreground"
            >
              {row.value}
            </text>
            <text
              x={x + 118}
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
