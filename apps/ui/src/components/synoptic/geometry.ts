import type { Pt } from "./types";

/** SVG path through waypoints with rounded corners (radius clamped to half of each segment). */
export function roundedPath(pts: Pt[], r = 10): string {
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
export function arrowHead(tip: Pt, u: Pt, len = 17, width = 16): string {
  const n = { x: -u.y, y: u.x };
  const bx = tip.x - u.x * len;
  const by = tip.y - u.y * len;
  return `${tip.x},${tip.y} ${bx + (n.x * width) / 2},${by + (n.y * width) / 2} ${bx - (n.x * width) / 2},${by - (n.y * width) / 2}`;
}
