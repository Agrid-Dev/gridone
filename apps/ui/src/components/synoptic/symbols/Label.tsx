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
/** Radius of the run-state LED. */
export const LED_R = 4;
/** Centre to centre of two LEDs in a row, one per head: 3 px apart. */
export const LED_PITCH = 2 * LED_R + 3;

/** The room the LEDs after a name take, `count` of them. */
export const ledRoom = (count: number) =>
  count ? LED_GAP + 2 * LED_R + (count - 1) * LED_PITCH : 0;

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
  /** One LED per head instead, in head order, each with its own fault; a
   *  head whose state nobody knows keeps its place, dashed. */
  heads?: { state?: SymbolState; fault: Severity | null }[];
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
  heads,
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
      {heads?.map((head, i) => (
        <Led
          key={i}
          at={{
            x: end + LED_GAP + i * LED_PITCH,
            y: y - 4,
          }}
          led={head.state}
          fault={head.fault}
        />
      ))}
    </>
  );
}

/** The 4 px run-state LED: ok when on, muted when off, the fault's
 *  colour first when the device is faulty, hollow and dashed while nothing
 *  is known. */
export function Led({
  at,
  led,
  fault,
}: {
  at: Pt;
  led: SymbolState | undefined;
  fault: Severity | null;
}) {
  const unknown = !fault && led === undefined;
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={LED_R}
      data-led={fault ? `fault-${fault}` : (led ?? "unknown")}
      strokeWidth={unknown ? 1 : undefined}
      strokeDasharray={unknown ? "2 1.5" : undefined}
      className={
        fault
          ? FAULT_FILL_CLASS[fault]
          : unknown
            ? "fill-none stroke-muted-foreground"
            : led === "on"
              ? "fill-status-ok"
              : "fill-muted-foreground"
      }
    />
  );
}
