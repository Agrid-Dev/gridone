import type { Severity } from "@gridone/sdk";
import { FAULT_FILL_CLASS } from "../fault";
import { HALO, HALO_CLASS, textWidth } from "../text";
import type { Pt } from "../types";

/** Run state of a symbol whose `state` slot is bound. */
export type SymbolState = "on" | "off";

/** Symbol labels are 11 px semibold: nothing on the plate is smaller. */
export const LABEL_SIZE = 11;
/** Space between a label's end and its LED. */
export const LED_GAP = 8;

type LabelProps = {
  text: string;
  /** Anchor the label sits `lift` px above, or on when `onFace`. */
  at: Pt;
  lift: number;
  /** Write the caption on the face, one line per word. */
  onFace?: boolean;
  /** Nudge a face caption right, as the isometric link does. */
  faceOffsetX?: number;
  /** Lights a run-state LED after the text. */
  led?: SymbolState;
  /** The device's fault level; null when healthy. */
  fault?: Severity | null;
  /** Where `at.x` falls on the text: its middle, its start or its end. */
  anchor?: "start" | "middle" | "end";
};

/** A symbol label, with the run-state LED the visual language puts after
 *  it: ok when on, muted when off, the fault's colour first when the
 *  device is faulty. */
/** A face caption's lines stand this far apart. */
const FACE_LINE = 12;

/** The lines a face caption is written on: one per word. */
const faceLines = (text: string) => text.split(" ");

/** Where a face caption's first baseline sits, from its anchor, so the
 *  lines stay centred on the face whatever their number. */
const faceTop = (at: Pt, lines: number) =>
  at.y + 4 - (FACE_LINE / 2) * (lines - 1);

/** The box a face caption covers: as wide as its longest word, one line
 *  high per word, centred on `at`. */
export function faceLabelBox(text: string, at: Pt) {
  const lines = faceLines(text);
  const w = Math.max(...lines.map((line) => textWidth(line, LABEL_SIZE)));
  const top = faceTop(at, lines.length);
  return {
    x0: at.x - w / 2,
    y0: top - LABEL_SIZE,
    x1: at.x + w / 2,
    y1: top + FACE_LINE * (lines.length - 1),
  };
}

export function Label({
  text,
  at,
  lift,
  onFace = false,
  faceOffsetX = 0,
  led,
  fault = null,
  anchor = "middle",
}: LabelProps) {
  const lines = onFace ? faceLines(text) : [text];
  const x = onFace ? at.x + faceOffsetX : at.x;
  const y = onFace ? faceTop(at, lines.length) : at.y - lift;
  const w = textWidth(text, LABEL_SIZE);
  // The LED follows the text's end, wherever the anchor put it.
  const end = anchor === "start" ? x + w : anchor === "end" ? x : x + w / 2;
  return (
    <>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fontSize={LABEL_SIZE}
        fontWeight={600}
        {...HALO}
        className={`fill-foreground ${HALO_CLASS}`}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : FACE_LINE}>
            {line}
          </tspan>
        ))}
      </text>
      {led && (
        <Led at={{ x: end + LED_GAP, y: y - 4 }} led={led} fault={fault} />
      )}
    </>
  );
}

/** The 4 px run-state LED: ok when on, muted when off, the fault's
 *  colour first when the device is faulty. */
export function Led({
  at,
  led,
  fault,
}: {
  at: Pt;
  led: SymbolState;
  fault: Severity | null;
}) {
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={4}
      data-led={fault ? `fault-${fault}` : led}
      className={
        fault
          ? FAULT_FILL_CLASS[fault]
          : led === "on"
            ? "fill-status-ok"
            : "fill-muted-foreground"
      }
    />
  );
}
