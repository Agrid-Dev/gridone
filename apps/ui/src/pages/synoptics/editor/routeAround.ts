import type { Cell, Side } from "@gridone/sdk";
import { runCells } from "@/components/synoptic/runs";
import { routeWaypoints, step, waypointsOf, type RoutePoint } from "./document";
import { cellKey } from "./runRules";

/** What a step costs on the floor, and overhead: authors keep runs on the
 *  floor and go up only to cross what the floor does not let through. */
const STEP = 2;
const STEP_HIGH = 3;
/** What a change of direction costs, up and down included: a riser reads
 *  as a bend. Authors draw with few; a detour turns as little as it can,
 *  then takes the shortest way. */
const BEND = 8;
/** What a climb or a descent costs on top: a hop over what is in the way
 *  is a last resort, taken when the floor offers no way round that is
 *  about as short. */
const RISE = 8;
/** How far past its two ends a detour may go, in cells. */
const REACH = 12;
/** How high a detour may climb: the one level overhead runs use. */
const HIGH = 1;

/** The six ways a run travels, by index: a reversed way is `d ^ 1`. */
const DIRS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
] as const;
const SIDES: readonly Side[] = ["+x", "-x", "+y", "-y", "+z", "-z"];
/** The heading of the first cell when no face was left. */
const NONE = DIRS.length;

/** Whether the path through `points` along `waypoints` keeps off `blocked`
 *  between its two ends and never passes a cell twice. */
function clear(
  points: RoutePoint[],
  waypoints: Cell[],
  blocked: ReadonlySet<string>,
): boolean {
  const cells = runCells([points[0].cell, ...waypoints, points.at(-1)!.cell]);
  const seen = new Set<string>();
  return cells.every((c, i) => {
    const key = cellKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return i === 0 || i === cells.length - 1 || !blocked.has(key);
  });
}

/**
 * The cells of a path from `a` to `b` that keeps off `blocked`: out of
 * `a`'s face, across the plan, and into `b` through its face, climbing
 * overhead (when `high`) where the floor is barred, as an author hops a
 * run over a collector. A search over (cell, heading) where a change of
 * direction costs `BEND` and a run never turns back on itself, so the
 * cheapest path is the one an author would draw around what is in the
 * way. Null when nothing within `REACH` of the two ends gets there.
 */
function detour(
  a: RoutePoint,
  b: RoutePoint,
  blocked: ReadonlySet<string>,
  high: boolean,
): Cell[] | null {
  const from = a.side ? step(a.cell, a.side) : a.cell;
  const to = b.side ? step(b.cell, b.side) : b.cell;
  const ends = new Set([cellKey(a.cell), cellKey(b.cell)]);
  const free = (c: Cell) => {
    const key = cellKey(c);
    return !blocked.has(key) && !ends.has(key);
  };
  // Out of `a`'s face and into `b`'s: the two cells no detour can avoid.
  if ((a.side && !free(from)) || (b.side && !free(to))) return null;

  const z0 = Math.min(0, from.z ?? 0, to.z ?? 0);
  const z1 = Math.max(high ? HIGH : 0, from.z ?? 0, to.z ?? 0);
  const x0 = Math.min(from.x, to.x) - REACH;
  const y0 = Math.min(from.y, to.y) - REACH;
  const w = Math.max(from.x, to.x) + REACH - x0 + 1;
  const d = Math.max(from.y, to.y) + REACH - y0 + 1;
  const levels = z1 - z0 + 1;
  const headings = NONE + 1;
  const id = (c: Required<Cell>, h: number) =>
    (((c.z - z0) * d + (c.y - y0)) * w + (c.x - x0)) * headings + h;
  const cellOf = (state: number): Required<Cell> => {
    const at = Math.floor(state / headings);
    return {
      x: (at % w) + x0,
      y: (Math.floor(at / w) % d) + y0,
      z: Math.floor(at / (w * d)) + z0,
    };
  };
  const start = a.side ? SIDES.indexOf(a.side) : NONE;
  // Entering `b` means moving against its face.
  const arrive = b.side ? SIDES.indexOf(b.side) ^ 1 : NONE;
  const goal = { x: to.x, y: to.y, z: to.z ?? 0 };

  // Costs are small whole numbers: the queue is one bucket per cost.
  const cost = new Int32Array(w * d * levels * headings).fill(-1);
  const back = new Int32Array(w * d * levels * headings).fill(-1);
  const buckets: number[][] = [];
  const push = (state: number, c: number, prev: number) => {
    if (cost[state] >= 0 && cost[state] <= c) return;
    cost[state] = c;
    back[state] = prev;
    (buckets[c] ??= []).push(state);
  };
  push(id({ x: from.x, y: from.y, z: from.z ?? 0 }, start), 0, -1);
  let found = -1;
  let best = Number.POSITIVE_INFINITY;
  for (let c = 0; c < buckets.length && c < best; c++) {
    for (const state of buckets[c] ?? []) {
      if (cost[state] !== c) continue;
      const h = state % headings;
      const here = cellOf(state);
      if (here.x === goal.x && here.y === goal.y && here.z === goal.z) {
        const total =
          c + (arrive !== NONE && h !== NONE && h !== arrive ? BEND : 0);
        if (total < best) {
          best = total;
          found = state;
        }
        continue;
      }
      DIRS.forEach((v, k) => {
        if (h !== NONE && k === (h ^ 1)) return;
        const next = { x: here.x + v.x, y: here.y + v.y, z: here.z + v.z };
        if (next.x < x0 || next.x >= x0 + w) return;
        if (next.y < y0 || next.y >= y0 + d) return;
        if (next.z < z0 || next.z > z1) return;
        // The goal is `b` itself when it has no face: always enterable.
        const atGoal =
          next.x === goal.x && next.y === goal.y && next.z === goal.z;
        if (!atGoal && !free(next)) return;
        const move = (next.z > 0 ? STEP_HIGH : STEP) + (v.z !== 0 ? RISE : 0);
        push(id(next, k), c + move + (h !== NONE && h !== k ? BEND : 0), state);
      });
    }
  }
  if (found < 0) return null;
  const plan: Cell[] = [];
  for (let s = found; s >= 0; s = back[s]) plan.unshift(cellOf(s));
  // Repeats where the plan meets its ends are dropped by the caller.
  return [a.cell, ...plan, to, b.cell];
}

/**
 * The waypoints of a run through `points`, like `routeWaypoints`, that
 * keeps off every cell in `blocked` (keys of `cellKey`) and never passes
 * a cell twice. The router's own path is kept whenever it does; otherwise
 * each leg between two points goes around what is in the way (`detour`),
 * overhead when `high` allows it, none crossing a leg before it. Null
 * when a leg cannot.
 */
export function routeAround(
  points: RoutePoint[],
  blocked: ReadonlySet<string>,
  high: boolean,
): Cell[] | null {
  const simple = routeWaypoints(points);
  if (clear(points, simple, blocked)) return simple;
  const taken = new Set(blocked);
  const cells: Cell[] = [points[0].cell];
  for (let i = 1; i < points.length; i++) {
    const leg = detour(points[i - 1], points[i], taken, high);
    if (!leg) return null;
    for (const c of runCells(leg)) taken.add(cellKey(c));
    cells.push(...leg.slice(1));
  }
  const waypoints = waypointsOf(cells);
  return clear(points, waypoints, blocked) ? waypoints : null;
}
