/**
 * Pure geometry for the thermostat dial: a 270° arc gauge with the gap
 * centred at the bottom.
 *
 * Angles are in degrees using the SVG screen convention: 0° points at
 * 3 o'clock and positive angles rotate clockwise (SVG's y axis points
 * down). The track starts at 135° (bottom-left), sweeps 270° clockwise
 * through the top, and ends at 45° (bottom-right, i.e. 135 + 270 = 405°).
 */

export const DIAL_START_DEG = 135;
export const DIAL_SWEEP_DEG = 270;

/** Setpoint range drawn when a thermostat exposes no (or degenerate)
 *  `temperature_setpoint_min` / `temperature_setpoint_max` bounds. */
export const DEFAULT_SETPOINT_RANGE = { min: 10, max: 30 };

/** Usable dial bounds: the device's when both exist and `min < max`,
 *  {@link DEFAULT_SETPOINT_RANGE} otherwise. */
export function dialRange(
  min: number | null | undefined,
  max: number | null | undefined,
): { min: number; max: number } {
  if (min == null || max == null || max <= min) return DEFAULT_SETPOINT_RANGE;
  return { min, max };
}

/** Position of `value` inside [min, max], clamped to [0, 1]. */
export function valueToFraction(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Dial angle (degrees, SVG convention) for `value` inside [min, max]. */
export function valueToAngle(value: number, min: number, max: number): number {
  return DIAL_START_DEG + DIAL_SWEEP_DEG * valueToFraction(value, min, max);
}

/** Angle (degrees, SVG convention) of the vector (dx, dy) measured from the
 *  dial centre. */
export function pointAngle(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Position along the track, as a fraction of the sweep, for a pointer angle.
 *
 * Angles falling in the bottom gap — the 90° the track does not cover — snap
 * to the nearer end: a pointer there has gone past one of the two extremes,
 * so the only sensible readings are "min" and "max". Without that, dragging
 * off the bottom-left end would jump the setpoint to the maximum.
 */
export function angleToFraction(angleDeg: number): number {
  const relative = (((angleDeg - DIAL_START_DEG) % 360) + 360) % 360;
  if (relative <= DIAL_SWEEP_DEG) return relative / DIAL_SWEEP_DEG;
  const gap = 360 - DIAL_SWEEP_DEG;
  return relative < DIAL_SWEEP_DEG + gap / 2 ? 1 : 0;
}

/**
 * Setpoint under a pointer at (dx, dy) from the dial centre, snapped to
 * `step` and clamped to [min, max]. Distance from the centre is irrelevant —
 * only the angle carries the value, so a drag that wanders inside or outside
 * the ring keeps working.
 */
export function pointToValue(
  dx: number,
  dy: number,
  min: number,
  max: number,
  step: number,
): number {
  const raw = min + angleToFraction(pointAngle(dx, dy)) * (max - min);
  // toFixed guards against binary drift for steps like 0.1 (0.30000000000004).
  const snapped = Number((Math.round(raw / step) * step).toFixed(4));
  return Math.min(max, Math.max(min, snapped));
}

/** Cartesian point at `angleDeg` on the circle (cx, cy, r). */
export function polarPoint(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * SVG path drawing the clockwise arc from `startDeg` to `endDeg`
 * (startDeg <= endDeg <= startDeg + 360).
 *
 * The large-arc flag must flip once the swept angle passes 180°: the full
 * 270° track needs it set while a small progress arc must leave it unset,
 * otherwise SVG picks the complementary arc.
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polarPoint(cx, cy, r, startDeg);
  const end = polarPoint(cx, cy, r, endDeg);
  const largeArcFlag = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}
