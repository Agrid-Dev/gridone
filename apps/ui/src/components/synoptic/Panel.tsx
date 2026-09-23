import type { Severity } from "@gridone/sdk";
import {
  Caption,
  DISC_R,
  FAULT_STROKE,
  FRAME_RADIUS,
  frameClass,
  SILENT_TEXT,
  Unit,
  unitWidth,
  valueClass,
} from "./Chip";
import { FAULT_FILL_CLASS } from "./fault";
import { LABEL_SIZE, Led, type SymbolState } from "./symbols/Label";
import { textWidth } from "./text";
import type { Pt } from "./types";
import { readingState, type SlotReading } from "./values";

export const PANEL_W = 144;
/** Title band: the rule sits at its bottom, the rows start below it. */
const HEADER_H = 26;
const RULE_Y = 21;
const ROW_H = 18;
const PAD = 7;
/** Space between a row's value and the stale disc before it. */
const DISC_GAP = 8;

export type PanelRow = {
  label: string;
  reading: SlotReading;
  /** The row is the device's fault word, coloured when the device is
   *  faulty. */
  error?: boolean;
  /** The native tooltip of the row. */
  title?: string | null;
};

type PanelProps = {
  /** Bottom centre of the panel. */
  at: Pt;
  title: string;
  rows: PanelRow[];
  led?: SymbolState;
  /** The device's fault level; null when healthy. */
  fault?: Severity | null;
};

export const panelHeight = (rows: number) => HEADER_H + rows * ROW_H + PAD;

/**
 * The equipment panel: title and run-state LED, a rule, one row per bound
 * slot. A faulty device takes its fault's colour on the border and the
 * LED; a stale row goes muted with a disc before its value; a silent row
 * shows a dash.
 */
export function Panel({ at, title, rows, led, fault = null }: PanelProps) {
  const h = panelHeight(rows.length);
  const x = at.x - PANEL_W / 2;
  const y = at.y - h;
  const right = x + PANEL_W - PAD;
  return (
    <g data-panel={title}>
      <rect
        x={x}
        y={y}
        width={PANEL_W}
        height={h}
        rx={FRAME_RADIUS}
        strokeWidth={fault ? FAULT_STROKE : 1}
        className={frameClass(fault, false)}
      />
      <text
        x={x + PAD}
        y={y + 15}
        fontSize={LABEL_SIZE}
        fontWeight={600}
        className="fill-foreground"
      >
        {title}
      </text>
      {led && <Led at={{ x: right - 4, y: y + 11 }} led={led} fault={fault} />}
      <line
        x1={x}
        y1={y + RULE_Y}
        x2={x + PANEL_W}
        y2={y + RULE_Y}
        strokeWidth={1}
        className="stroke-border"
      />
      {rows.map((row, i) => {
        const rowY = y + HEADER_H + ROW_H * i + 12;
        const state = readingState(row.reading);
        const muted = state !== "live";
        const { unit } = row.reading;
        const text = row.reading.text ?? SILENT_TEXT;
        const valueEnd = right - unitWidth(unit);
        return (
          <g key={row.label} data-row={state}>
            {row.title && <title>{row.title}</title>}
            <Caption
              at={{ x: x + PAD, y: rowY }}
              text={row.label}
              anchor="start"
            />
            {state === "stale" && (
              <circle
                cx={valueEnd - textWidth(text, LABEL_SIZE) - DISC_GAP}
                cy={rowY - 4}
                r={DISC_R}
                className="fill-muted-foreground"
              />
            )}
            <text
              x={valueEnd}
              y={rowY}
              textAnchor="end"
              fontSize={LABEL_SIZE}
              fontWeight={600}
              className={
                row.error && fault && !muted
                  ? `${FAULT_FILL_CLASS[fault]} tabular-nums`
                  : valueClass(state)
              }
            >
              {text}
            </text>
            {unit && (
              <Unit at={{ x: right, y: rowY }} unit={unit} anchor="end" />
            )}
          </g>
        );
      })}
    </g>
  );
}
