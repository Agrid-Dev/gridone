import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import { deviceTypeName, OTHER_KEY } from "@/lib/deviceTypes";
import { lookupSemanticColor, SEMANTIC_TEXT_CLASS } from "@/lib/semanticColors";

/**
 * Drawing kit for the fleet card's type glyphs (`FleetGlyph` in the registry).
 *
 * One grammar for every type, taken from the pump:
 * - a silhouette of the machine on a 48-unit canvas, casing in the muted
 *   fill, so the type reads before the name;
 * - one live part (blades, coil, column, drop…) carrying the single state
 *   the card can show — toned when active, muted when stopped, and the
 *   outline dashed while the device has never reported;
 * - no motion: a grid of spinning glyphs says nothing.
 *
 * The rendered state is exposed as `data-state` on the glyph, the one thing a
 * reader of the grid is meant to take from it besides the type.
 */

export const GLYPH_SIZE = 48;
export const DASH = "2.5 2";

export type RunState = "running" | "stopped" | "unknown";

/** Run state from the standard on/off and mode attributes: stopped when
 *  `onoff_state` is false, unknown when neither is reported, else running (a
 *  unit reporting a mode but no on/off switch is taken as running). */
export function runState(
  onoffState: boolean | null,
  mode: string | null = null,
): RunState {
  if (onoffState === false) return "stopped";
  if (onoffState == null && mode == null) return "unknown";
  return "running";
}

/** Tone of the live part: the mode's semantic colour while running (the
 *  same tint as the mode in the card footer), `fallback` for a mode with no
 *  colour or no mode at all, muted otherwise. */
export function liveTone(
  run: RunState,
  mode: string | null,
  fallback = "text-hvac-fan",
): string {
  if (run !== "running") return "text-muted-foreground";
  const colour = mode ? lookupSemanticColor("mode", mode) : undefined;
  return colour ? SEMANTIC_TEXT_CLASS[colour] : fallback;
}

/** What an air handler's coil is doing, from its battery valves: heating or
 *  cooling while that valve is open (> 0 %), idle (null) when both are
 *  reported shut — ventilation only. A unit reporting no valve falls back
 *  to its `hvac_mode`. */
export function coilMode(
  heatingValve: number | null,
  coolingValve: number | null,
  hvacMode: string | null,
): string | null {
  if (heatingValve != null && heatingValve > 0) return "heat";
  if (coolingValve != null && coolingValve > 0) return "cool";
  if (heatingValve != null || coolingValve != null) return null;
  return hvacMode;
}

/** The glyph's accessible name: the device's type. The state it draws is
 *  written out elsewhere on the card (mode, verdict). */
export function useGlyphLabel(device: Device): string {
  const { t } = useTranslation("standardDevices");
  return deviceTypeName(device.type, t) ?? t(`${OTHER_KEY}.name`);
}

export function GlyphFrame({
  label,
  state,
  children,
}: {
  label: string;
  state: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={GLYPH_SIZE}
      height={GLYPH_SIZE}
      role="img"
      aria-label={label}
      data-state={state}
      className="shrink-0 overflow-visible"
    >
      {children}
    </svg>
  );
}

/** A machine body: muted fill, border stroke, dashed while unreported. */
export function Casing({
  unknown,
  ...rect
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  unknown: boolean;
}) {
  return (
    <rect
      {...rect}
      strokeWidth={1.5}
      strokeDasharray={unknown ? DASH : undefined}
      className="fill-muted stroke-border"
    />
  );
}

/** Three-blade fan in a round shroud (the synoptic FanGlyph, rescaled): blades
 *  solid in the live tone when running, outlined otherwise. */
export function Fan({
  cx,
  cy,
  r,
  tone,
  running,
}: {
  cx: number;
  cy: number;
  r: number;
  tone: string;
  running: boolean;
}) {
  const k = r / 24;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={1.25}
        className="fill-card stroke-border"
      />
      <g transform={`translate(${cx} ${cy}) scale(${k})`} className={tone}>
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle})`}
            d="M0 -4 C7 -7 8 -17 0 -20 C-8 -17 -7 -7 0 -4 Z"
            fill={running ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={running ? 0 : 1.25 / k}
          />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={r * 0.14} className="fill-border" />
    </g>
  );
}

/** Heating/cooling battery: a frame with tubes, in the live tone. */
export function Coil({
  x,
  y,
  width,
  height,
  tone,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  tone: string;
}) {
  return (
    <g className={tone}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={1}
        strokeWidth={1.25}
        stroke="currentColor"
        className="fill-card"
      />
      {[0.3, 0.5, 0.7].map((f) => (
        <line
          key={f}
          x1={x + width * f}
          y1={y + 2}
          x2={x + width * f}
          y2={y + height - 2}
          strokeWidth={1.25}
          stroke="currentColor"
        />
      ))}
    </g>
  );
}

/** Small flow arrowhead pointing `dir`. */
export function Flow({
  x,
  y,
  dir,
}: {
  x: number;
  y: number;
  dir: "left" | "right" | "up";
}) {
  const d =
    dir === "right"
      ? `M ${x - 2} ${y - 3} L ${x + 1} ${y} L ${x - 2} ${y + 3}`
      : dir === "left"
        ? `M ${x + 2} ${y - 3} L ${x - 1} ${y} L ${x + 2} ${y + 3}`
        : `M ${x - 3} ${y + 2} L ${x} ${y - 1} L ${x + 3} ${y + 2}`;
  return (
    <path
      d={d}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-muted-foreground"
    />
  );
}

/** Duct connection sticking out of an air handler: a short stub with its
 *  flange against the casing and the flow chevron inside. The stubs are the
 *  air-handler tell — an outdoor unit stands on feet and has none. */
export function DuctStub({
  x,
  y,
  side,
  dir,
}: {
  /** Casing edge the stub leaves from. */
  x: number;
  /** Stub centre line. */
  y: number;
  side: "left" | "right";
  dir: "left" | "right";
}) {
  const w = 6;
  const h = 10;
  const left = side === "left" ? x - w : x;
  return (
    <g>
      <rect
        x={left}
        y={y - h / 2}
        width={w}
        height={h}
        strokeWidth={1.25}
        className="fill-muted stroke-muted-foreground/60"
      />
      <line
        x1={x}
        y1={y - h / 2 - 1.5}
        x2={x}
        y2={y + h / 2 + 1.5}
        strokeWidth={2}
        strokeLinecap="round"
        className="stroke-muted-foreground"
      />
      <Flow x={left + w / 2} y={y} dir={dir} />
    </g>
  );
}

/** Vertical module joints across an air-handler casing. */
export function ModuleJoints({
  xs,
  y1,
  y2,
}: {
  xs: number[];
  y1: number;
  y2: number;
}) {
  return (
    <>
      {xs.map((x) => (
        <line
          key={x}
          x1={x}
          y1={y1}
          x2={x}
          y2={y2}
          strokeWidth={1}
          className="stroke-border"
        />
      ))}
    </>
  );
}

/** Round state indicator in the glyph's lower-right corner (thermostat mode,
 *  PMS booking). */
export function CornerBadge({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <g>
      <circle
        cx={36}
        cy={36}
        r={10}
        strokeWidth={1.25}
        className="fill-card stroke-border"
      />
      <Icon
        x={29.5}
        y={29.5}
        width={13}
        height={13}
        strokeWidth={2}
        className={tone}
      />
    </g>
  );
}
