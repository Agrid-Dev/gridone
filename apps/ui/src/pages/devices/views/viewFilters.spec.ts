import { describe, expect, it } from "vitest";
import { devicesFilterToListParams } from "@/lib/devices";
import { parseTagCriteria, drilldownFilter } from "./viewFilters";

describe("tag filter boundaries", () => {
  it("treats JavaScript property names as ordinary deployment-owned tags", () => {
    expect(parseTagCriteria("constructor:east, __proto__:west")).toEqual(
      JSON.parse('{"constructor":["east"],"__proto__":["west"]}'),
    );
    expect(drilldownFilter({}, ["constructor"], ["east"]).tags).toEqual({
      constructor: ["east"],
    });
  });
  it("rejects malformed pairs and normalizes accented keys", () => {
    expect(parseTagCriteria("Étage:2, étage:3, pièce:ch_204")).toEqual({
      étage: ["2", "3"],
      pièce: ["ch_204"],
    });
    for (const value of ["floor", "floor:", "a:b:c", "a:bad value"])
      expect(() => parseTagCriteria(value)).toThrow();
  });
  it("keeps an empty tag filter empty when converting it to GET parameters", () => {
    const filter = drilldownFilter(
      { tags: { ecs: ["east"] } },
      ["ecs"],
      ["west"],
    );
    expect(filter.tags).toEqual({ ecs: [] });
    expect(devicesFilterToListParams(filter).ids).toEqual([]);
  });
});
