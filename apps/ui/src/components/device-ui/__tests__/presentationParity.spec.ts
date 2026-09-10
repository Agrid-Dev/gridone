import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import backendFixture from "../../../../../../packages/devices_manager/tests/unit/core/presentation/fixtures/thermostat_presentation.yaml?raw";
import { AGRID_THERMOSTAT_PRESENTATION } from "../fixtures/agridThermostat/presentation";
import mainFont from "../fixtures/agridThermostat/mainFont.json";
import montserrat from "../fixtures/agridThermostat/montserrat16.json";

describe("backend / browser presentation fixture parity", () => {
  it("keeps the complete page, face, bindings and font metrics identical", () => {
    // Atlas dimensions describe the image loader, not the authored dialect.
    expect(load(backendFixture)).toEqual({
      ...AGRID_THERMOSTAT_PRESENTATION,
      glyph_sets: {
        main: {
          asset: "main_font",
          line_height: mainFont.line_height,
          base_line: mainFont.base_line,
          cells: mainFont.cells,
        },
        montserrat: {
          asset: "montserrat",
          line_height: montserrat.line_height,
          base_line: montserrat.base_line,
          cells: montserrat.cells,
          kerning: montserrat.kerning,
        },
      },
    });
  });
});
