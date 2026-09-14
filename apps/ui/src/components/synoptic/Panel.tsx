import {
  CAPTION_TRACKING,
  FAULT_STROKE,
  FRAME_RADIUS,
  frameClass,
  SILENT_TEXT,
  textWidth,
  valueClass,
} from "./Chip";
import { LABEL_SIZE, Led, type SymbolState } from "./symbols/Label";
import type { Pt } from "./types";
import { readingState, type SlotReading } from "./values";

export const PANEL_W = 164;
const HEADER_H = 24;
const ROW_H = 18;
const PAD = 8;

export type PanelRow = {
  label: string;
  reading: SlotReading;
  /** The row is the device's fault word, red when the device is faulty. */
  error?: boolean;
};

type PanelProps = {
  /** Bottom centre of the panel. */
  at: Pt;
  title: string;
  rows: PanelRow[];
  led?: SymbolState;
  faulty?: boolean;
};

export const panelHeight = (rows: number) => HEADER_H + rows * ROW_H + PAD;

/**
 * The equipment panel: title and run-state LED, a rule, one row per bound
 * slot. A faulty device takes the error border and a red LED; a stale row
 * goes muted with a disc before its value; a silent row shows a dash.
 */
export function Panel({ at, title, rows, led, faulty = false }: PanelProps) {
  const h = panelHeight(rows.length);
  const x = at.x - PANEL_W / 2;
  const y = at.y - h;
  return (
    <g data-panel={title}>
      <rect
        x={x}
        y={y}
        width={PANEL_W}
        height={h}
        rx={FRAME_RADIUS}
        strokeWidth={faulty ? FAULT_STROKE : 1}
        className={frameClass(faulty, false)}
      />
      <text
        x={x + PAD}
        y={y + 16}
        fontSize={LABEL_SIZE}
        fontWeight={600}
        className="fill-foreground"
      >
        {title}
      </text>
      {led && (
        <Led
          at={{ x: x + PANEL_W - PAD - 4, y: y + 12 }}
          led={led}
          faulty={faulty}
        />
      )}
      <line
        x1={x}
        y1={y + HEADER_H}
        x2={x + PANEL_W}
        y2={y + HEADER_H}
        strokeWidth={1}
        className="stroke-border"
      />
      {rows.map((row, i) => {
        const rowY = y + HEADER_H + ROW_H * (i + 1) - 5;
        const state = readingState(row.reading);
        const muted = state !== "live";
        const text = row.reading.text ?? SILENT_TEXT;
        return (
          <g key={row.label} data-row={state}>
            <text
              x={x + PAD}
              y={rowY}
              fontSize={LABEL_SIZE}
              fontWeight={600}
              letterSpacing={CAPTION_TRACKING}
              className="fill-muted-foreground uppercase"
            >
              {row.label}
            </text>
            {state === "stale" && (
              <circle
                cx={x + PANEL_W - PAD - 6 - textWidth(text, LABEL_SIZE)}
                cy={rowY - 4}
                r={2.5}
                className="fill-muted-foreground"
              />
            )}
            <text
              x={x + PANEL_W - PAD}
              y={rowY}
              textAnchor="end"
              fontSize={LABEL_SIZE}
              fontWeight={600}
              className={
                row.error && faulty && !muted
                  ? "fill-status-error tabular-nums"
                  : valueClass(muted)
              }
            >
              {text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
