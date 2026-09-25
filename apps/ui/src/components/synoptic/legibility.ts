import { createContext } from "react";
import type { Box } from "./placement";
import type { Pt } from "./types";

/**
 * What a piece of text on the plate takes, for the floor that keeps it
 * legible: the box it covers at its own size, the point it hangs from
 * (where its leader meets the plate, or its own spot when it has none),
 * and its rank, lower being kept first when the text no longer fits.
 */
export type TextFootprint = {
  anchor: Pt;
  box: Box;
  rank: number;
  /** The text this one hangs from, with no leader of its own (a reading
   *  under its name): it gives way with it, or it would float ownerless. */
  with?: string;
};

/** Who gives way first once the text is held above its drawn size: notes,
 *  then the tags on the runs, then the readings, the names last and the
 *  name of a device in fault never before another. */
export const TEXT_RANK = {
  alarm: 0,
  name: 1,
  reading: 2,
  tag: 3,
  note: 4,
} as const;

/** How much larger than drawn the plate's text is held: 1 while it reads
 *  at its own size. */
export const TextScaleContext = createContext(1);

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

/**
 * The text that gives way once it is held `k` times its drawn size: taken
 * by rank, then in the order given, each piece is kept when its grown box
 * (a little wider than measured, see `WIDTH_SLACK`) stays inside `frame`
 * (the plate's own, past which the canvas clips) and covers none already
 * kept, and hidden otherwise. No two kept boxes ever overlap. At `k` ≤ 1 the text reads as drawn and nothing is hidden, since
 * the placement already kept it apart.
 */
export function declutter(
  items: readonly { id: string; text?: TextFootprint }[],
  k: number,
  frame?: Box,
): Set<string> {
  const hidden = new Set<string>();
  if (k <= 1) return hidden;
  const texts = items
    .map((item, order) => ({ id: item.id, text: item.text, order }))
    .filter(
      (t): t is { id: string; text: TextFootprint; order: number } =>
        t.text !== undefined,
    )
    .sort((a, b) => a.text.rank - b.text.rank || a.order - b.order);
  const kept: Box[] = [];
  for (const { id, text } of texts) {
    // Ranked after what it hangs from, so that one is already decided.
    if (text.with !== undefined && hidden.has(text.with)) {
      hidden.add(id);
      continue;
    }
    const grown = scaleAbout(widened(text.box), text.anchor, k);
    const outside =
      !!frame &&
      (grown.x0 < frame.x0 ||
        grown.y0 < frame.y0 ||
        grown.x1 > frame.x1 ||
        grown.y1 > frame.y1);
    if (outside || kept.some((box) => cover(box, grown))) hidden.add(id);
    else kept.push(grown);
  }
  return hidden;
}
