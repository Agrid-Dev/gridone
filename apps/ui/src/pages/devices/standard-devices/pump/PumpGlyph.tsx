import { cn } from "@/lib/utils";
import { PUMP_STATE_STROKE_CLASS, PUMP_STATE_TEXT_CLASS } from "./state";
import type { PumpState } from "./state";

/** Where the motor sits for a pump drawn at (cx, cy) with volute radius r.
 *  Exported so annotation leaders can land on it instead of re-deriving the
 *  same arithmetic and drifting out of alignment. */
export function pumpMotorBox(cx: number, cy: number, r: number) {
  const w = r * 1.55;
  const h = r * 1.5;
  // The motor sits *on* the volute, overlapping it slightly, the way a
  // circulator's stator does — not floating above on a visible stalk.
  const bottom = cy - r * 0.55;
  return { x: cx - w / 2, y: bottom - h, w, h, bottom };
}

/**
 * A centrifugal inline circulator, drawn in the parent SVG's viewBox space:
 * volute casing straddling the pipe, motor stood on top, impeller inside.
 *
 * That silhouette — round body, motor above, pipe through the middle — is what
 * a pump looks like on every P&ID and plant-room schematic, which is the
 * point: the type should be readable before the label is.
 *
 * Every colour comes from a theme token, so the glyph inverts correctly in
 * dark mode instead of carrying baked-in light-theme greys.
 */
export function PumpGlyph({
  cx,
  cy,
  state,
  spinning,
  title,
  r = 46,
}: {
  cx: number;
  cy: number;
  state: PumpState;
  spinning: boolean;
  title: string;
  /** Volute radius; the motor scales from it. */
  r?: number;
}) {
  const motor = pumpMotorBox(cx, cy, r);
  const tone = PUMP_STATE_TEXT_CLASS[state];

  return (
    <g>
      <title>{title}</title>

      {/* Motor: a filled barrel with vertical cooling fins and a terminal head
          on top. Filled rather than hollow, and finned along its axis, so it
          reads as a machine — an outlined box with horizontal rules reads as a
          sheet of paper. */}
      <rect
        x={motor.x}
        y={motor.y}
        width={motor.w}
        height={motor.h}
        rx={r * 0.14}
        strokeWidth="2"
        className="fill-muted stroke-border"
      />
      {[0.2, 0.35, 0.5, 0.65, 0.8].map((f) => (
        <line
          key={f}
          x1={motor.x + motor.w * f}
          y1={motor.y + r * 0.16}
          x2={motor.x + motor.w * f}
          y2={motor.bottom - r * 0.12}
          strokeWidth="1.5"
          className="stroke-border"
        />
      ))}
      {/* Terminal head */}
      <rect
        x={motor.x - r * 0.1}
        y={motor.y - r * 0.22}
        width={motor.w + r * 0.2}
        height={r * 0.26}
        rx={r * 0.08}
        strokeWidth="2"
        className="fill-card stroke-border"
      />

      {/* Volute casing. The ring carries the hydraulic accent when turning,
          and breaks into dashes when the pump has never reported — a stopped
          pump and one we have no feedback from are different facts, and a
          solid grey ring would claim the first while meaning the second. */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth="3"
        strokeDasharray={
          state === "unknown" ? `${r * 0.2} ${r * 0.16}` : undefined
        }
        className={cn("fill-card", PUMP_STATE_STROKE_CLASS[state])}
      />

      {/* Impeller: six backward-curved vanes, the giveaway that this is a
          centrifugal pump rather than a valve or a gauge. */}
      <g transform={`translate(${cx} ${cy})`} className={tone}>
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle})`}
            d={`M 0 ${-r * 0.2} C ${r * 0.2} ${-r * 0.32} ${r * 0.46} ${-r * 0.5} ${r * 0.66} ${-r * 0.34}`}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke="currentColor"
          />
        ))}
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="1.8s"
            repeatCount="indefinite"
            additive="sum"
          />
        )}
      </g>
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.13}
        className={cn("fill-current", tone)}
      />
    </g>
  );
}
