import { COLORS } from "../theme";
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

const STATUS_COLOR: Record<Status, string> = {
  ok: COLORS.statusOk,
  warn: COLORS.statusWarn,
  idle: COLORS.statusIdle,
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
        fill={COLORS.bg}
        stroke={COLORS.panelStroke}
        strokeWidth={1.5}
      />
      <text
        x={x + w / 2}
        y={y + 18}
        textAnchor="middle"
        dominantBaseline="central"
        fill={COLORS.text}
        fontSize={15}
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
          fill={STATUS_COLOR[s]}
          stroke="#0f141b"
          strokeOpacity={0.4}
        />
      ))}
      {rows.map((row, i) => {
        const cy = y + 66 + i * ROW_H + ROW_H / 2 - 3;
        return (
          <g key={row.label}>
            <text
              x={x + 10}
              y={cy}
              dominantBaseline="central"
              fill={COLORS.text}
              fontSize={15}
            >
              {row.label}
            </text>
            <rect
              x={x + 40}
              y={cy - 13}
              width={72}
              height={26}
              fill={COLORS.valueBoxFill}
              stroke={COLORS.valueBoxStroke}
              strokeWidth={1.5}
            />
            <text
              x={x + 40 + 36}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fill={COLORS.text}
              fontSize={15}
            >
              {row.value}
            </text>
            <text
              x={x + 118}
              y={cy}
              dominantBaseline="central"
              fill={COLORS.text}
              fontSize={13.5}
            >
              {row.unit}
            </text>
          </g>
        );
      })}
    </g>
  );
}
