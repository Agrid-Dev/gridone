import type { Scalar } from "../conditions";
import type {
  Box,
  GlyphCell,
  GlyphTextLayer,
  LoadedGlyphSet,
  LvAlign,
  TextPart,
} from "./types";

/**
 * Bitmap-text layout with the integer arithmetic of LVGL 9, so that a
 * `glyph-text` layer lands on the same pixels as the label it replicates.
 *
 * Positions follow `lv_obj_refr_pos` / `lv_obj_align_to`: each half is
 * truncated separately (`pw / 2 - w / 2`, C integer division), which differs
 * from `(pw - w) / 2` for odd sizes. Text width is the sum of the advances
 * with the kerning of each pair (`lv_text_get_width`), and a glyph is
 * blitted at `pen + offsetX`, `label.y + lineHeight - baseLine - height -
 * offsetY` (`draw_letter`). Example: a 58-px-wide "2" centred in a 185×95 box
 * at (153, 98) with dx = -54 has its label at x = 153 + (92 - 29) - 54 = 162.
 */

const trunc = Math.trunc;

export function alignInBox(
  parent: Box,
  width: number,
  height: number,
  align: LvAlign,
  dx = 0,
  dy = 0,
): { x: number; y: number } {
  const midX = trunc(parent.width / 2) - trunc(width / 2);
  const midY = trunc(parent.height / 2) - trunc(height / 2);
  const right = parent.width - width;
  const bottom = parent.height - height;
  let x: number;
  let y: number;
  switch (align) {
    case "top-left":
      [x, y] = [0, 0];
      break;
    case "top-mid":
      [x, y] = [midX, 0];
      break;
    case "top-right":
      [x, y] = [right, 0];
      break;
    case "left-mid":
      [x, y] = [0, midY];
      break;
    case "center":
      [x, y] = [midX, midY];
      break;
    case "right-mid":
      [x, y] = [right, midY];
      break;
    case "bottom-left":
      [x, y] = [0, bottom];
      break;
    case "bottom-mid":
      [x, y] = [midX, bottom];
      break;
    case "bottom-right":
      [x, y] = [right, bottom];
      break;
    case "out-right-mid":
      [x, y] = [parent.width, midY];
      break;
    case "out-left-mid":
      [x, y] = [-width, midY];
      break;
  }
  return { x: parent.x + x + dx, y: parent.y + y + dy };
}

/** Advance of `char` when followed by `next` (kerning applied). */
function advance(set: LoadedGlyphSet, char: string, next: string | undefined) {
  const cell = set.cells[char];
  if (!cell) return 0;
  const kern = next === undefined ? 0 : (set.kerning?.[char + next] ?? 0);
  return cell.advance + kern;
}

export function measureText(set: LoadedGlyphSet, text: string): number {
  const chars = Array.from(text);
  return chars.reduce(
    (width, char, i) => width + advance(set, char, chars[i + 1]),
    0,
  );
}

export type PlacedGlyph = {
  char: string;
  cell: GlyphCell;
  x: number;
  y: number;
};

export type TextLayout = { label: Box; glyphs: PlacedGlyph[] };

export type ResolvedAnchor = {
  box: Box;
  align: LvAlign;
  dx?: number;
  dy?: number;
};

export function layoutGlyphText(
  set: LoadedGlyphSet,
  layer: { anchor: ResolvedAnchor; size?: GlyphTextLayer["size"] },
  text: string,
): TextLayout {
  const width = layer.size?.width ?? measureText(set, text);
  const height = layer.size?.height ?? set.lineHeight;
  const { box, align, dx, dy } = layer.anchor;
  const origin = alignInBox(box, width, height, align, dx, dy);
  const label = { ...origin, width, height };
  const glyphs: PlacedGlyph[] = [];
  const chars = Array.from(text);
  let pen = label.x;
  chars.forEach((char, i) => {
    const cell = set.cells[char];
    if (cell) {
      glyphs.push({
        char,
        cell,
        x: pen + cell.offsetX,
        y: label.y + set.lineHeight - set.baseLine - cell.height - cell.offsetY,
      });
    }
    pen += advance(set, char, chars[i + 1]);
  });
  return { label, glyphs };
}

export type TextResolver = (binding: string) => Scalar | null | undefined;

/**
 * Text of a `glyph-text` layer, or null when a bound value is unknown: the
 * device shows nothing rather than a partial number.
 */
export function resolveText(
  parts: TextPart[],
  resolve: TextResolver,
): string | null {
  let out = "";
  for (const part of parts) {
    const piece = resolvePart(part, resolve);
    if (piece === null) return null;
    out += piece;
  }
  return out;
}

function resolvePart(part: TextPart, resolve: TextResolver): string | null {
  if ("literal" in part) return part.literal;
  if ("digit" in part) {
    const value = resolve(part.digit.binding);
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const chars = Array.from(part.digit.chars ?? "0123456789");
    return chars[digitOf(value, part.digit.place)] ?? null;
  }
  if ("number" in part) {
    const value = resolve(part.number.binding);
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value.toFixed(part.number.decimals);
  }
  const value = resolve(part.select.binding);
  if (value === null || value === undefined) return null;
  return part.select.cases[String(value)] ?? part.select.default ?? null;
}

/**
 * Digit of |value| at a decimal place, on the device's fixed-point grid
 * (thousandths): 21.4 → tens 2, units 1, tenths 4.
 */
export function digitOf(
  value: number,
  place: "tens" | "units" | "tenths",
): number {
  const fixed = Math.round(Math.abs(value) * 1000);
  const divisor = { tens: 10000, units: 1000, tenths: 100 }[place];
  return trunc(fixed / divisor) % 10;
}
