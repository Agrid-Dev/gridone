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
import {
  LABEL_SIZE,
  Led,
  LED_PITCH,
  ledRoom,
  type SymbolState,
} from "./symbols/Label";
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
  /** The fault of the head this row's word belongs to, on a symbol of
   *  several machines; the panel's own fault colours it otherwise. */
  fault?: Severity | null;
  /** The native tooltip of the row. */
  title?: string | null;
};

type PanelProps = {
  /** Bottom centre of the panel. */
  at: Pt;
  title: string;
  rows: PanelRow[];
  led?: SymbolState;
  /** One light per head instead, in head order, as the name's on the
   *  sheet. */
  heads?: { state?: SymbolState; fault: Severity | null }[];
  /** The device's fault level; null when healthy. */
  fault?: Severity | null;
};

export const panelHeight = (rows: number) => HEADER_H + rows * ROW_H + PAD;

/** A panel is `PANEL_W` wide, wider only when its title and the LEDs after
 *  it would not fit: a twin's two LEDs after a long name. */
export const panelWidth = (title: string, leds: number) =>
  Math.max(PANEL_W, 2 * PAD + textWidth(title, LABEL_SIZE) + ledRoom(leds));

/**
 * The equipment panel: title and run-state LED, a rule, one row per bound
 * slot. A faulty device takes its fault's colour on the border and the
 * LED; a stale row goes muted with a disc before its value; a silent row
 * shows a dash.
 */
export function Panel({
  at,
  title,
  rows,
  led,
  heads,
  fault = null,
}: PanelProps) {
  const h = panelHeight(rows.length);
  const w = panelWidth(title, led ? 1 : (heads?.length ?? 0));
  const x = at.x - w / 2;
  const y = at.y - h;
  const right = x + w - PAD;
  return (
    <g data-panel={title}>
      <rect
        x={x}
        y={y}
        width={w}
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
      {heads?.map((head, i) => (
        <Led
          key={i}
          at={{ x: right - 4 - (heads.length - 1 - i) * LED_PITCH, y: y + 11 }}
          led={head.state}
          fault={head.fault}
        />
      ))}
      <line
        x1={x}
        y1={y + RULE_Y}
        x2={x + w}
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
        const error = row.error
          ? row.fault === undefined
            ? fault
            : row.fault
          : null;
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
                error && !muted
                  ? `${FAULT_FILL_CLASS[error]}${row.reading.word ? "" : " tabular-nums"}`
                  : valueClass(state, row.reading.word)
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
