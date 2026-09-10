import type { GlyphCell, LoadedGlyphSet } from "../../face";
import mainFontAtlasUrl from "./assets/main-font-atlas.png";
import montserrat16AtlasUrl from "./assets/montserrat-16-atlas.png";
import mainFont from "./mainFont.json";
import montserrat16 from "./montserrat16.json";

/**
 * Glyph sets of the thermostat fixture, decoded from the firmware's LVGL
 * fonts (`lvgl_ui/fonts/main_font.c`, `lv_font_montserrat_16.c`): the atlas
 * PNG holds the glyph masks, the JSON their cells, advances, offsets and
 * kerning pairs. This is the shape a driver package's `glyph_sets` entry
 * resolves to.
 */

type GlyphSetSpec = {
  line_height: number;
  base_line: number;
  atlas: { width: number; height: number };
  cells: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      advance: number;
      offset_x: number;
      offset_y: number;
    }
  >;
  kerning?: Record<string, number>;
};

export function loadGlyphSet(
  spec: GlyphSetSpec,
  atlasUrl: string,
): LoadedGlyphSet {
  const cells: Record<string, GlyphCell> = {};
  for (const [char, cell] of Object.entries(spec.cells)) {
    cells[char] = {
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      advance: cell.advance,
      offsetX: cell.offset_x,
      offsetY: cell.offset_y,
    };
  }
  return {
    atlasUrl,
    atlasSize: spec.atlas,
    lineHeight: spec.line_height,
    baseLine: spec.base_line,
    cells,
    kerning: spec.kerning,
  };
}

export const AGRID_THERMOSTAT_GLYPH_SETS: Record<string, LoadedGlyphSet> = {
  main: loadGlyphSet(mainFont, mainFontAtlasUrl),
  montserrat: loadGlyphSet(montserrat16, montserrat16AtlasUrl),
};
