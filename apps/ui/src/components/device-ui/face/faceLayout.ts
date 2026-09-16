import {
  EvaluationBudget,
  evaluateCondition,
  isBlocked,
  isVisible,
  type BindingResolver,
  type Condition,
  type Verdict,
} from "../conditions";
import { layoutGlyphText, resolveText, type PlacedGlyph } from "./textLayout";
import type {
  Box,
  DeviceFaceDocument,
  FaceAction,
  GlyphCell,
  HexColor,
  LayerColor,
  LoadedGlyphSet,
  LocalizedText,
} from "./types";

/**
 * Pure layout of a device face: every visible layer resolved against the
 * current binding values into concrete pixel rectangles, colours and
 * glyphs. `DeviceFace` only turns this list into DOM; tests compare it with
 * the layer lists rendered from the device firmware.
 */

export type PlacedLayer =
  | { kind: "rect"; box: Box; fill: HexColor; radius: number }
  | { kind: "image"; box: Box; asset: string }
  | {
      kind: "glyph";
      box: Box;
      set: LoadedGlyphSet;
      cell: GlyphCell;
      char: string;
      color: HexColor;
      label?: LocalizedText;
    }
  | {
      kind: "glyph-run";
      label: Box;
      glyphs: PlacedGlyph[];
      set: LoadedGlyphSet;
      color: HexColor;
      text: string;
      clip?: Box;
      /** Whether the run carries a value a reader should hear. */
      spoken: boolean;
      accessibleLabel?: LocalizedText;
    }
  | {
      kind: "button";
      box: Box;
      label: LocalizedText;
      action: FaceAction;
      blocked: boolean;
    };

export type FaceLayoutInput = {
  document: DeviceFaceDocument;
  resolve: BindingResolver;
  glyphSet: (id: string) => LoadedGlyphSet | undefined;
  budget?: EvaluationBudget;
};

export function layoutFace({
  document,
  resolve,
  glyphSet,
  budget = new EvaluationBudget(),
}: FaceLayoutInput): PlacedLayer[] {
  const verdict = (condition: Condition | undefined): Verdict | undefined =>
    condition === undefined
      ? undefined
      : evaluateCondition(condition, resolve, budget);
  const color = (value: LayerColor): HexColor => {
    if (typeof value === "string") return value;
    const rule = value.rules.find((r) => verdict(r.when) === "true");
    return rule?.color ?? value.default;
  };
  // Boxes of the layers laid out so far, for `anchor.ref`.
  const boxes = new Map<string, Box>();
  const placed: PlacedLayer[] = [];

  for (const layer of document.layers) {
    if (!isVisible(verdict(layer.visible_when))) continue;
    switch (layer.kind) {
      case "rect":
        placed.push({
          kind: "rect",
          box: layer.box,
          fill: layer.fill,
          radius: layer.radius ?? 0,
        });
        break;
      case "image":
        placed.push({ kind: "image", box: layer.box, asset: layer.asset });
        break;
      case "glyph": {
        const set = glyphSet(layer.glyph_set);
        const cell = set?.cells[layer.char];
        if (!set || !cell) break;
        placed.push({
          kind: "glyph",
          box: layer.box,
          set,
          cell,
          char: layer.char,
          color: color(layer.color),
          label: layer.label,
        });
        break;
      }
      case "glyph-text": {
        const set = glyphSet(layer.glyph_set);
        if (!set) break;
        const text = resolveText(layer.text, resolve);
        if (text === null) break;
        const anchorBox =
          "ref" in layer.anchor
            ? boxes.get(layer.anchor.ref)
            : layer.anchor.box;
        if (!anchorBox) break;
        const run = layoutGlyphText(
          set,
          { anchor: { ...layer.anchor, box: anchorBox }, size: layer.size },
          text,
        );
        placed.push({
          kind: "glyph-run",
          label: run.label,
          glyphs: run.glyphs,
          set,
          color: color(layer.color),
          text,
          clip: layer.clip,
          spoken: layer.text.some(
            (part) => "number" in part || "select" in part,
          ),
          accessibleLabel: layer.label,
        });
        if (layer.id) boxes.set(layer.id, run.label);
        break;
      }
      case "button":
        placed.push({
          kind: "button",
          box: layer.box,
          label: layer.label,
          action: layer.action,
          blocked: isBlocked(verdict(layer.blocked_when)),
        });
        break;
    }
    if ("id" in layer && layer.id && "box" in layer && !boxes.has(layer.id)) {
      boxes.set(layer.id, layer.box);
    }
  }
  return placed;
}
