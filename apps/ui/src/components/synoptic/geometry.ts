import type { Pt } from "./types";

/** SVG path through waypoints with rounded corners (radius clamped to half of each segment). */
export function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    const inLen = Math.hypot(c.x - p.x, c.y - p.y);
    const outLen = Math.hypot(n.x - c.x, n.y - c.y);
    if (inLen === 0 || outLen === 0) continue;
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const inU = { x: (c.x - p.x) / inLen, y: (c.y - p.y) / inLen };
    const outU = { x: (n.x - c.x) / outLen, y: (n.y - c.y) / outLen };
    d += ` L ${c.x - inU.x * rr} ${c.y - inU.y * rr} Q ${c.x} ${c.y} ${c.x + outU.x * rr} ${c.y + outU.y * rr}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** Unit direction of the segment a -> b. */
export function unit(a: Pt, b: Pt): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/** Polygon points string for a solid arrow head ending exactly at `tip`, pointing along `u`. */
export function arrowHead(tip: Pt, u: Pt, len: number, width: number): string {
  const n = { x: -u.y, y: u.x };
  const bx = tip.x - u.x * len;
  const by = tip.y - u.y * len;
  return `${tip.x},${tip.y} ${bx + (n.x * width) / 2},${by + (n.y * width) / 2} ${bx - (n.x * width) / 2},${by - (n.y * width) / 2}`;
}

/** Position of `value` inside [min, max], clamped to [0, 1]; 0 when the
 *  range is empty. */
export function fraction(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** A 270° dial: the track starts at 135° (bottom-left) and sweeps
 *  clockwise through the top, leaving the gap centred at the bottom. */
export const DIAL_START_DEG = 135;
export const DIAL_SWEEP_DEG = 270;

/** Cartesian point at `angleDeg` on the circle (cx, cy, r). Angles use the
 *  SVG convention: 0° at 3 o'clock, positive clockwise. */
export function polarPoint(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): Pt {
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
