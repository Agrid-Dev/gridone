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
  it("offers no invented modes when no options are declared", () => {
    expect(resolveModeOptions(undefined)).toEqual([]);
    expect(resolveModeOptions(modeAttr())).toEqual([]);
    expect(resolveModeOptions(modeAttr([]))).toEqual([]);
  });
  it("preserves declared order and unfamiliar modes", () => {
    expect(resolveModeOptions(modeAttr(["cool", "heat"]))).toEqual([
      "cool",
      "heat",
    ]);
    expect(resolveModeOptions(modeAttr(["heat", "eco", "boost"]))).toEqual([
      "heat",
      "eco",
      "boost",
    ]);
  });
});
