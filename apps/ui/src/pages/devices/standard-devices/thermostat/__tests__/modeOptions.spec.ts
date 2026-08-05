import { describe, expect, it } from "vitest";
import type { AttributeFields } from "@/lib/faults";
import { resolveModeOptions } from "../modeOptions";

function modeAttr(valueOptions?: AttributeFields["value_options"]) {
  return {
    kind: "standard",
    name: "mode",
    data_type: "str",
    read_write_modes: ["read", "write"],
    current_value: "heat",
    last_updated: null,
    last_changed: null,
    value_options: valueOptions,
  } as AttributeFields;
}

describe("resolveModeOptions", () => {
  it("falls back to heat/cool/auto when the attribute is absent", () => {
    expect(resolveModeOptions(undefined)).toEqual(["heat", "cool", "auto"]);
  });

  it("falls back when value_options is missing or empty", () => {
    expect(resolveModeOptions(modeAttr())).toEqual(["heat", "cool", "auto"]);
    expect(resolveModeOptions(modeAttr([]))).toEqual(["heat", "cool", "auto"]);
  });

  it("keeps only the declared options, in canonical order", () => {
    expect(resolveModeOptions(modeAttr(["cool", "heat"]))).toEqual([
      "heat",
      "cool",
    ]);
    expect(
      resolveModeOptions(modeAttr(["dry", "fan", "auto", "cool", "heat"])),
    ).toEqual(["heat", "cool", "auto", "fan", "dry"]);
  });

  it("drops wire values the UI cannot render", () => {
    expect(resolveModeOptions(modeAttr(["heat", "eco", "boost"]))).toEqual([
      "heat",
    ]);
  });
});
