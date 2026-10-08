import { createContext } from "react";
import {
  bounds,
  edgePoint,
  findSpot,
  RING_STEP,
  segmentHitsBox,
  type Box,
  type Direction,
  type Segment,
} from "./placement";
import type { Pt } from "./types";

/**
 * What a piece of text on the plate takes, for the floor that keeps it
 * legible: the box it covers at its own size, the point it grows about
 * (where its leader meets it, or its own spot when it has none), and its
 * rank, lower being kept first when the text no longer fits.
 */
export type TextFootprint = {
  anchor: Pt;
  box: Box;
  rank: number;
  /** The text this one hangs from, with no leader of its own (a reading
   *  under its name): it is kept, moved or hidden with it, or it would
   *  float ownerless. */
  with?: string;
  /** The symbol the text names: its body never hides it, since a name is
   *  placed against its own body (on its face, along its bar, above it). */
  on?: string;
  /** Set on a reading and on what names it: once grown, a taken spot moves
   *  it rather than hides it, by the search the plate placed it with,
   *  around `around`, `start` px off it in `order`. `tether` when it has no
   *  leader of its own, so a line joins it to `around` once moved. */
  move?: {
    around: Box;
    order: readonly Direction[];
    start: number;
    tether?: boolean;
  };
};

/** A text moved off its spot once the plate is zoomed out: how far, and
 *  the line back to what it reads when it has no leader of its own. */
export type Held = { shift: Pt; tether?: [Pt, Pt] };

/** What the plate draws that grown text must not cover: each symbol's
 *  body, by symbol, and every run as the line it draws. */
export type Drawing = {
  bodies: ReadonlyMap<string, readonly Box[]>;
  runs: readonly Segment[];
};

/** The order text is held in once grown, the first kept first: the name
 *  of a device in fault, the readings (and the name a lone chip goes by),
 *  the tags on the runs, then the other names and the notes. */
export const TEXT_RANK = {
  alarm: 0,
  reading: 1,
  tag: 2,
  name: 3,
  note: 4,
} as const;

/** How much larger than drawn the plate's text is held: 1 while it reads
 *  at its own size. */
export const TextScaleContext = createContext(1);

/** How far a held text is moved off its spot, so its leader and disc can
 *  still end on what it reads. */
export const TextShiftContext = createContext<Pt>({ x: 0, y: 0 });

/** Where a point of the plate is drawn inside a text held `k` times larger
 *  about `grows` and moved by `shift`, so the transform brings it back
 *  onto the point. */
export const pinned = (
  grows: Pt,
  point: Pt,
  k: number,
  shift: Pt = { x: 0, y: 0 },
): Pt => ({
  x: grows.x + (point.x - grows.x - shift.x) / k,
  y: grows.y + (point.y - grows.y - shift.y) / k,
});

/** How far a reading may move off its spot, in rings of the search: a
 *  step or two, so it still reads as what it sits by. */
const NEAR_RINGS = 3;

/** Steps of the scale per doubling: the text moves in steps of about 9 %,
 *  so a wheel zooming through a range lays the plate out a few times, not
 *  at every event. */
const STEPS_PER_DOUBLING = 8;

/**
 * How much the text must grow so text drawn `basePx` high shows at least
 * `minPx` on screen, when one plate unit covers `pxPerUnit` screen pixels:
 * 1 when it already does, when there is no floor, or before layout. Rounded
 * up to the next step, so the text is never held below the floor.
 */
export function textScale(
  minPx: number | undefined,
  basePx: number,
  pxPerUnit: number,
): number {
  if (!minPx || !(pxPerUnit > 0)) return 1;
  const k = minPx / (basePx * pxPerUnit);
  if (k <= 1) return 1;
  return (
    2 ** (Math.ceil(Math.log2(k) * STEPS_PER_DOUBLING) / STEPS_PER_DOUBLING)
  );
}

/** `box` grown `k` times about `anchor`, which stays put. */
export const scaleAbout = (box: Box, anchor: Pt, k: number): Box => ({
  x0: anchor.x + (box.x0 - anchor.x) * k,
  y0: anchor.y + (box.y0 - anchor.y) * k,
  x1: anchor.x + (box.x1 - anchor.x) * k,
  y1: anchor.y + (box.y1 - anchor.y) * k,
});

/** Strictly overlapping: text that only touches keeps both. */
const cover = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** How much wider than measured a footprint is taken, per side: its width
 *  is estimated from an average glyph (`textWidth`), and a run of capitals
 *  draws up to 15 % wider, an error the scale multiplies. Only the width:
 *  a reading hanging under its name stays clear of it. */
const WIDTH_SLACK = 0.1;

const widened = (box: Box): Box => {
  const pad = (box.x1 - box.x0) * WIDTH_SLACK;
  return { ...box, x0: box.x0 - pad, x1: box.x1 + pad };
};

/** Whether `box` covers a run, or a body other than `on`'s. */
const coversDrawing = (
  box: Box,
  runs: readonly Segment[],
  bodies: readonly Body[],
  on?: string,
) =>
  runs.some((run) => segmentHitsBox(run, box, 0)) ||
  bodies.some((b) => b.id !== on && cover(b.box, box));

type Body = { id: string; box: Box };

const union = (boxes: Box[]): Box =>
  bounds(
    boxes.flatMap((b) => [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y1 },
    ]),
  );

const shifted = (box: Box, d: Pt): Box => ({
  x0: box.x0 + d.x,
  y0: box.y0 + d.y,
  x1: box.x1 + d.x,
  y1: box.y1 + d.y,
});

/** `box` moved the least that brings it inside `frame`; one larger than the
 *  frame keeps its top left corner in. */
const within = (box: Box, frame: Box): Box =>
  shifted(box, {
    x: Math.max(frame.x0 - box.x0, Math.min(0, frame.x1 - box.x1)),
    y: Math.max(frame.y0 - box.y0, Math.min(0, frame.y1 - box.y1)),
  });

const centre = (box: Box): Pt => ({
  x: (box.x0 + box.x1) / 2,
  y: (box.y0 + box.y1) / 2,
});

/** Room for everything past the frame, as obstacles. */
const FAR = 1e9;
const pastFrame = (frame: Box): Box[] => [
  { x0: -FAR, y0: -FAR, x1: frame.x0, y1: FAR },
  { x0: frame.x1, y0: -FAR, x1: FAR, y1: FAR },
  { x0: -FAR, y0: -FAR, x1: FAR, y1: frame.y0 },
  { x0: -FAR, y0: frame.y1, x1: FAR, y1: FAR },
];

type Text = { id: string; text: TextFootprint; order: number };

/**
 * How the text is held once grown `k` times its drawn size. Taken by rank,
 * then in the order given, with the texts hanging from it (`with`), each
 * text is kept where its grown box (a little wider than measured, see
 * `WIDTH_SLACK`) stays inside `frame` (the plate's own, past which the
 * canvas clips) and covers no text already kept and none of the `drawing`
 * but the body of the symbol it names. Elsewhere text that carries a
 * `move` takes the first spot clear of all of it within `NEAR_RINGS` of its
 * own search, or as a last resort stays on its spot, pulled inside the
 * frame; any other text is hidden. At `k` ≤ 1 the text reads as drawn and stays as placed.
 */
export function declutter(
  items: readonly { id: string; text?: TextFootprint }[],
  k: number,
  frame?: Box,
  drawing?: Drawing,
): { hidden: Set<string>; held: Map<string, Held> } {
  const hidden = new Set<string>();
  const held = new Map<string, Held>();
  if (k <= 1) return { hidden, held };
  const texts = items
    .map((item, order) => ({ id: item.id, text: item.text, order }))
    .filter((t): t is Text => t.text !== undefined)
    .sort((a, b) => a.text.rank - b.text.rank || a.order - b.order);
  const ids = new Set(texts.map((t) => t.id));
  const hanging = new Map<string, Text[]>();
  for (const t of texts) {
    if (t.text.with === undefined || !ids.has(t.text.with)) continue;
    const list = hanging.get(t.text.with);
    if (list) list.push(t);
    else hanging.set(t.text.with, [t]);
  }
  const runs = drawing?.runs ?? [];
  const bodies: Body[] = [...(drawing?.bodies ?? [])].flatMap(([id, parts]) =>
    parts.map((box) => ({ id, box })),
  );
  const kept: Box[] = [];
  const boundary = frame ? pastFrame(frame) : [];
  for (const host of texts) {
    if (host.text.with !== undefined && ids.has(host.text.with)) continue;
    const unit = [host, ...(hanging.get(host.id) ?? [])];
    const { on, move } = host.text;
    const own = union(
      unit.map(({ text }) => scaleAbout(widened(text.box), text.anchor, k)),
    );
    const clear =
      !boundary.some((b) => cover(b, own)) &&
      !kept.some((b) => cover(b, own)) &&
      !coversDrawing(own, runs, bodies, on);
    if (clear || !move) {
      if (clear) kept.push(own);
      else for (const { id } of unit) hidden.add(id);
      continue;
    }
    const spot = findSpot(
      move.around,
      own.x1 - own.x0,
      own.y1 - own.y0,
      [
        ...boundary,
        ...kept,
        ...runs,
        ...bodies.flatMap((b) => (b.id === on ? [] : [b.box])),
      ],
      [...move.order],
      move.start * k,
      RING_STEP * k,
      NEAR_RINGS,
    );
    // Nowhere clear close by: it still shows, on its own spot, pulled
    // inside the frame so it is not cut off.
    const box = spot?.box ?? (frame ? within(own, frame) : own);
    kept.push(box);
    const shift = { x: box.x0 - own.x0, y: box.y0 - own.y0 };
    if (shift.x === 0 && shift.y === 0) continue;
    const drawn = shifted(
      scaleAbout(host.text.box, host.text.anchor, k),
      shift,
    );
    const tether: [Pt, Pt] | undefined = move.tether
      ? [
          edgePoint(drawn, centre(move.around)),
          edgePoint(move.around, centre(drawn)),
        ]
      : undefined;
    for (const { id } of unit) held.set(id, { shift, tether });
  }
  return { hidden, held };
}
