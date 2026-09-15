import { LABEL_SIZE } from "./symbols/Label";
import { textWidth } from "./text";
import type { Pt } from "./types";
import { readingState, type SlotReading } from "./values";

export const CHIP_H = 22;
const CHIP_PAD = 8;
const VALUE_SIZE = 12;
const UNIT_SIZE = 11;
/** Space between a value and its unit. */
const UNIT_GAP = 3;
const LABEL_GAP = 4;
/** Border width a faulty device's chip or panel takes. */
export const FAULT_STROKE = 1.5;
/** Corner radius of a chip or panel. */
export const FRAME_RADIUS = 4;
/** Radius of the disc that marks a tag's cell on its run and a stale row. */
export const DISC_R = 2.5;
/** Letter spacing of an uppercase caption. */
const CAPTION_TRACKING = 0.5;
/** Rendered as a bare dash so a silent slot keeps its place on the plate. */
export const SILENT_TEXT = "–";

type ChipProps = {
  /** Centre of the chip. */
  at: Pt;
  reading: SlotReading;
  /** Uppercase caption above the chip. */
  label?: string;
};

/** Width the unit takes after a value, gap included; 0 without one. */
export const unitWidth = (unit: string | null) =>
  unit ? textWidth(unit, UNIT_SIZE) + UNIT_GAP : 0;

export const chipWidth = (text: string, unit: string | null = null) =>
  Math.max(36, textWidth(text, VALUE_SIZE) + unitWidth(unit) + 2 * CHIP_PAD);

/** Frame of a chip or panel: the error colour on a faulty device, muted
 *  for an old or missing value, the border otherwise. */
export const frameClass = (faulty: boolean, muted: boolean) =>
  faulty
    ? "fill-card stroke-status-error"
    : muted
      ? "fill-card stroke-muted-foreground"
      : "fill-card stroke-border";

/** Text of a value: muted once it is old or missing. */
export const valueClass = (muted: boolean) =>
  muted ? "fill-muted-foreground tabular-nums" : "fill-foreground tabular-nums";

type CaptionProps = {
  at: Pt;
  text: string;
  anchor?: "start" | "middle";
};

/** A tag or slot label: 11 px semibold uppercase tracked, muted. */
export function Caption({ at, text, anchor = "middle" }: CaptionProps) {
  return (
    <text
      x={at.x}
      y={at.y}
      textAnchor={anchor}
      fontSize={LABEL_SIZE}
      fontWeight={600}
      letterSpacing={CAPTION_TRACKING}
      className="fill-muted-foreground uppercase"
    >
      {text}
    </text>
  );
}

type UnitProps = {
  at: Pt;
  unit: string;
  anchor?: "start" | "end";
};

/** The unit after a value, 11 px and always muted: the value carries the
 *  reading, the unit only names it. */
export function Unit({ at, unit, anchor = "start" }: UnitProps) {
  return (
    <text
      x={at.x}
      y={at.y}
      textAnchor={anchor}
      fontSize={UNIT_SIZE}
      className="fill-muted-foreground"
      data-unit
    >
      {unit}
    </text>
  );
}

/**
 * A value on the plate, never bare text. Stale is a dashed muted border
 * with muted text; silent is a dash; a faulty device's tag takes the error
 * border. The label above never changes with the value.
 */
export function Chip({ at, reading, label }: ChipProps) {
  const { text, unit, stale, faulty } = reading;
  const state = readingState(reading);
  const muted = state !== "live";
  const shown = text ?? SILENT_TEXT;
  const w = chipWidth(shown, unit);
  // The value and unit centre together: the value shifts left by half the
  // unit's width and the unit starts right after it.
  const vx = at.x - unitWidth(unit) / 2;
  return (
    <g data-chip={state}>
      {label && (
        <Caption
          at={{ x: at.x, y: at.y - CHIP_H / 2 - LABEL_GAP }}
          text={label}
        />
      )}
      <rect
        x={at.x - w / 2}
        y={at.y - CHIP_H / 2}
        width={w}
        height={CHIP_H}
        rx={FRAME_RADIUS}
        strokeWidth={faulty ? FAULT_STROKE : 1}
        strokeDasharray={stale ? "3 2" : undefined}
        className={frameClass(faulty, muted)}
      />
      <text
        x={vx}
        y={at.y + 4}
        textAnchor="middle"
        fontSize={VALUE_SIZE}
        fontWeight={600}
        className={valueClass(muted)}
      >
        {shown}
      </text>
      {unit && (
        <Unit
          at={{
            x: vx + textWidth(shown, VALUE_SIZE) / 2 + UNIT_GAP,
            y: at.y + 4,
          }}
          unit={unit}
        />
      )}
    </g>
  );
}
