import { TOOLTIP_OFFSET } from "./constants";

/**
 * Place the tooltip along one axis: beside the cursor, offset by
 * `TOOLTIP_OFFSET`.
 *
 * It sits after the cursor normally, and flips to the other side when that
 * would overhang the far edge. Flipping is not enough on its own: a box wider
 * than the room before the cursor then overhangs the *near* edge instead, so
 * the result is held at zero. Overhang isn't merely untidy — wherever an
 * ancestor hides overflow, as a dashboard tile does, the excess is cut off.
 *
 * Only the near edge needs holding. The far edge is already safe by
 * construction: the un-flipped position is taken only when it fits, and the
 * flipped one starts before a cursor that is itself within the extent.
 *
 * `size` is measured, not assumed: tooltip width follows the series labels,
 * which the caller supplies and which can be several times any fixed guess.
 */
export function placeTooltip(
  cursor: number,
  size: number,
  extent: number,
): number {
  const after = cursor + TOOLTIP_OFFSET;
  const before = cursor - TOOLTIP_OFFSET - size;
  return Math.max(0, after + size > extent ? before : after);
}
