import { LABEL_SIZE } from "./symbols/Label";
import type { Pt } from "./types";
import { readingState, type SlotReading } from "./values";

export const CHIP_H = 22;
const CHIP_PAD = 8;
const VALUE_SIZE = 12;
const LABEL_GAP = 4;
/** Border width a faulty device's chip or panel takes. */
export const FAULT_STROKE = 1.5;
/** Corner radius of a chip or panel. */
export const FRAME_RADIUS = 4;
/** Letter spacing of an uppercase caption. */
export const CAPTION_TRACKING = 0.5;
/** Rendered as a bare dash so a silent slot keeps its place on the plate. */
export const SILENT_TEXT = "–";

/** Width semibold text takes, from the average glyph of the app's face. */
export const textWidth = (text: string, size: number) =>
  Math.round(text.length * size * 0.6);

type ChipProps = {
  /** Centre of the chip. */
  at: Pt;
  reading: SlotReading;
  /** Uppercase caption above the chip. */
  label?: string;
};

export const chipWidth = (text: string) =>
  Math.max(36, textWidth(text, VALUE_SIZE) + 2 * CHIP_PAD);

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

/**
 * A value on the plate, never bare text. Stale is a dashed muted border
 * with muted text; silent is a dash; a faulty device's tag takes the error
 * border. The label above never changes with the value.
 */
export function Chip({ at, reading, label }: ChipProps) {
  const { text, stale, faulty } = reading;
  const state = readingState(reading);
  const muted = state !== "live";
  const shown = text ?? SILENT_TEXT;
  const w = chipWidth(shown);
  return (
    <g data-chip={state}>
      {label && (
        <text
          x={at.x}
          y={at.y - CHIP_H / 2 - LABEL_GAP}
          textAnchor="middle"
          fontSize={LABEL_SIZE}
          fontWeight={600}
          letterSpacing={CAPTION_TRACKING}
          className="fill-muted-foreground uppercase"
        >
          {label}
        </text>
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
        x={at.x}
        y={at.y + 4}
        textAnchor="middle"
        fontSize={VALUE_SIZE}
        fontWeight={600}
        className={valueClass(muted)}
      >
        {shown}
      </text>
    </g>
  );
}
