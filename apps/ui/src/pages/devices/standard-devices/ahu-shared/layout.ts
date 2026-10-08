import { DUCT_HEIGHT, STREAM_ROW_HEIGHT } from "@/components/synoptic/duct";

/** Vertical layout of an AHU synoptic (viewBox units), from how much each
 *  part has to say. The extract and supply stream blocks share the right
 *  column and are each centred on their duct, so two tall blocks push the
 *  ducts apart; a coil with a water loop needs a band under the supply duct
 *  for its pipes and readings. */
export type AhuLayout = {
  extractY: number;
  supplyY: number;
  height: number;
};

/** Room above the extract duct: its fan readout, and the block's title. */
const TOP_MARGIN = 70;
/** Duct-to-duct distance in the plain case. */
const DEFAULT_RUN_GAP = 114;
/** Breathing room between the two stream blocks when they set the gap. */
const BLOCK_GAP = 24;
/** Readouts under the supply duct, without a coil loop. */
const BOTTOM_MARGIN = 70;
/** The coil loop band: the pipes with their valve and temperatures, then
 *  flow and power. */
export const COIL_LOOP_HEIGHT = 150;
const BOTTOM_PADDING = 12;
/** The exchanger glyph and the extract-side readouts need the block title
 *  to clear the top; a block taller than the default margin shifts the
 *  extract duct down. */
const BLOCK_TITLE_ROOM = 20;

export type AhuLayoutInput = {
  /** Lines of the extract-side stream block; 0 without an extract run. */
  extractLines: number;
  supplyLines: number;
  /** Whether a coil draws its water loop under the supply duct. */
  coilLoop: boolean;
};

const blockHalf = (lines: number) => (lines * STREAM_ROW_HEIGHT) / 2;

export function ahuLayout({
  extractLines,
  supplyLines,
  coilLoop,
}: AhuLayoutInput): AhuLayout {
  const hasExtract = extractLines > 0;
  const extractY = hasExtract
    ? Math.max(
        TOP_MARGIN,
        blockHalf(extractLines) + BLOCK_TITLE_ROOM - DUCT_HEIGHT / 2,
      )
    : 0;
  const supplyY = hasExtract
    ? Math.max(
        extractY + DEFAULT_RUN_GAP,
        extractY + blockHalf(extractLines) + BLOCK_GAP + blockHalf(supplyLines),
      )
    : Math.max(44, blockHalf(supplyLines) + BLOCK_TITLE_ROOM - DUCT_HEIGHT / 2);
  const supplyCy = supplyY + DUCT_HEIGHT / 2;
  const belowDuct = coilLoop
    ? COIL_LOOP_HEIGHT + BOTTOM_PADDING
    : BOTTOM_MARGIN;
  const height = Math.max(
    supplyY + DUCT_HEIGHT + belowDuct,
    supplyCy + blockHalf(supplyLines) + BOTTOM_PADDING,
  );
  return { extractY, supplyY, height };
}
