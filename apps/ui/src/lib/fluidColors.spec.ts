import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLUID_FILL_CLASS,
  FLUID_STROKE_CLASS,
  fluidFillClass,
  fluidStrokeClass,
} from "./fluidColors";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/** The backend vocabulary, read from the generated SDK schema rather than
 *  the maps under test. Matches the string members of the `Fluid` union. */
const FLUIDS = [
  ...read("../../../../sdk/ts/src/generated/openapi.ts")
    .match(/Fluid:\n(?:\s*\| "[a-z_]+";?\n)+/)![0]
    .matchAll(/"([a-z_]+)"/g),
].map((m) => m[1]);

/** Colours Tailwind registers, config key to the variable it wraps. The
 *  key is what the `stroke-<key>` utility is generated from, so a renamed
 *  key drops the class even while the variable stays defined. */
const TAILWIND_COLORS = new Map(
  [
    ...read("../../tailwind.config.js").matchAll(
      /"?([\w-]+)"?:\s*"hsl\(var\(--([\w-]+)\)\)"/g,
    ),
  ].map((m) => [m[1], m[2]]),
);

const INDEX_CSS = read("../index.css");

describe("fluid colour classes", () => {
  it("has one stroke and one fill entry per backend fluid", () => {
    expect(Object.keys(FLUID_STROKE_CLASS).sort()).toEqual([...FLUIDS].sort());
    expect(Object.keys(FLUID_FILL_CLASS).sort()).toEqual([...FLUIDS].sort());
  });

  it("names a colour registered in Tailwind and defined in both themes", () => {
    const names = [
      ...Object.values(FLUID_STROKE_CLASS).map((c) =>
        c.replace(/^stroke-/, ""),
      ),
      ...Object.values(FLUID_FILL_CLASS).map((c) => c.replace(/^fill-/, "")),
    ];
    for (const name of names) {
      expect(TAILWIND_COLORS.get(name)).toBe(name);
      expect(INDEX_CSS.match(new RegExp(`--${name}:`, "g"))).toHaveLength(2);
    }
  });
});

describe("fluid class lookup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the class for a known fluid", () => {
    expect(fluidStrokeClass("dhw_loop")).toBe("stroke-fluid-dhw-loop");
    expect(fluidFillClass("dhw_loop")).toBe("fill-fluid-dhw-loop");
  });

  it("draws an unknown fluid as primary supply and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unknown = "steam" as never;
    expect(fluidStrokeClass(unknown)).toBe("stroke-fluid-primary-supply");
    expect(fluidFillClass(unknown)).toBe("fill-fluid-primary-supply");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain("steam");
  });
});
