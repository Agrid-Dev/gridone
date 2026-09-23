import { textWidth } from "../text";
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
  faulty?: boolean;
  /** Where `at.x` falls on the text: its middle, its start or its end. */
  anchor?: "start" | "middle" | "end";
};

/** A symbol label, with the run-state LED the visual language puts after
 *  it: ok when on, muted when off, error first when the device is faulty. */
export function Label({
  text,
  at,
  lift,
  onFace = false,
  faceOffsetX = 0,
  led,
  faulty = false,
  anchor = "middle",
}: LabelProps) {
  const lines = onFace ? text.split(" ") : [text];
  const x = onFace ? at.x + faceOffsetX : at.x;
  const y = onFace ? at.y + 4 - 6 * (lines.length - 1) : at.y - lift;
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
        className="fill-foreground"
      >
        {lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
      {led && (
        <Led at={{ x: end + LED_GAP, y: y - 4 }} led={led} faulty={faulty} />
      )}
    </>
  );
}

/** The 4 px run-state LED: ok when on, muted when off, error first when
 *  the device is faulty. */
export function Led({
  at,
  led,
  faulty,
}: {
  at: Pt;
  led: SymbolState;
  faulty: boolean;
}) {
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={4}
      className={
        faulty
          ? "fill-status-error"
          : led === "on"
            ? "fill-status-ok"
            : "fill-muted-foreground"
      }
    />
  );
}
