import type { Condition } from "../conditions";
import type { LocalizedText } from "@/lib/localizedText";

/** Rectangle in view-box pixels (the device's native screen coordinates). */
export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** `#RRGGBB`, validated by the backend before a document is stored. */
export type HexColor = string;

export type { LocalizedText } from "@/lib/localizedText";

/** A colour that depends on device state: first matching rule wins. */
export type ConditionalColor = {
  rules: { when: Condition; color: HexColor }[];
  default: HexColor;
};
export type LayerColor = HexColor | ConditionalColor;

export type FaceAction = {
  control: string;
  op: "toggle" | "increment" | "decrement" | "cycle";
};

type LayerBase = {
  /** Optional name other layers may anchor on. */
  id?: string;
  box: Box;
  visible_when?: Condition;
};

export type ImageLayer = LayerBase & { kind: "image"; asset: string };

export type RectLayer = LayerBase & {
  kind: "rect";
  fill: HexColor;
  radius?: number;
};

/** One character of a glyph set stretched into a box, tinted. */
export type GlyphLayer = LayerBase & {
  kind: "glyph";
  glyph_set: string;
  char: string;
  color: LayerColor;
  label?: LocalizedText;
};

/**
 * Alignment of a text label relative to an anchor box, with the semantics of
 * LVGL's `lv_obj_align` (inner alignments) and `lv_obj_align_to` (`out-*`
 * alignments): the label's own size is measured from the text, then placed
 * with integer arithmetic. See `textLayout.ts`.
 */
export type LvAlign =
  | "top-left"
  | "top-mid"
  | "top-right"
  | "left-mid"
  | "center"
  | "right-mid"
  | "bottom-left"
  | "bottom-mid"
  | "bottom-right"
  | "out-right-mid"
  | "out-left-mid";

/**
 * The box a label is aligned on: a fixed box, or the laid-out box of an
 * earlier layer (by `id`) when the device aligns one object on another
 * whose size depends on its content (`lv_obj_align_to`).
 */
export type Anchor = { align: LvAlign; dx?: number; dy?: number } & (
  | { box: Box }
  | { ref: string }
);

/** Pieces concatenated into the text of a `glyph-text` layer. */
export type TextPart =
  | { literal: string }
  /**
   * One decimal digit of a bound number, as the device draws multi-label
   * numbers: `tens`/`units`/`tenths` of the absolute value. `chars` maps the
   * digit 0–9 to the glyph to use (defaults to "0123456789"), so a glyph set
   * can carry combined "dot + digit" glyphs for the tenths.
   */
  | {
      digit: {
        binding: string;
        place: "tens" | "units" | "tenths";
        chars?: string;
      };
    }
  /** A bound number formatted with a fixed number of decimals. */
  | { number: { binding: string; decimals: number } }
  /** A bound value mapped to text; the default applies to unmapped values. */
  | {
      select: {
        binding: string;
        cases: Record<string, string>;
        default?: string;
      };
    };

/**
 * A run of glyphs laid out like an LVGL label: measured from the glyph set's
 * advances and kerning, aligned on an anchor, each glyph blitted at its own
 * offsets. Reproduces a bitmap-font label of the device pixel for pixel.
 */
export type GlyphTextLayer = {
  kind: "glyph-text";
  id?: string;
  glyph_set: string;
  anchor: Anchor;
  text: TextPart[];
  color: LayerColor;
  /** Fixed label size instead of the size of its content. */
  size?: { width?: number; height?: number };
  /** Clip the glyphs to this box (a parent container on the device). */
  clip?: Box;
  visible_when?: Condition;
  label?: LocalizedText;
};

export type ButtonLayer = LayerBase & {
  kind: "button";
  label: LocalizedText;
  action: FaceAction;
  blocked_when?: Condition;
};

export type FaceLayer =
  | ImageLayer
  | RectLayer
  | GlyphLayer
  | GlyphTextLayer
  | ButtonLayer;

export type DeviceFaceDocument = {
  kind: "device-face";
  label: LocalizedText;
  view_box: Size;
  layers: FaceLayer[];
};

/** A character's cell in an atlas plus its bitmap-font metrics. */
export type GlyphCell = Box & {
  /** Pen advance in pixels (LVGL `adv_w`, already rounded). */
  advance: number;
  /** Bitmap offsets from the pen position / baseline (LVGL `ofs_x`/`ofs_y`). */
  offsetX: number;
  offsetY: number;
};

/**
 * A glyph set ready to render: the atlas image (object URL), where each
 * character sits in it, and the font metrics needed to lay text out. Built
 * by the presentation loader from the document's `glyph_sets` and the
 * fetched asset.
 */
export type LoadedGlyphSet = {
  atlasUrl: string;
  atlasSize: Size;
  lineHeight: number;
  baseLine: number;
  cells: Record<string, GlyphCell>;
  /** Advance correction for a pair of characters, keyed by the pair. */
  kerning?: Record<string, number>;
};
