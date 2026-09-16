/**
 * The generated symbol schemas are cast to `SymbolSchema`, so a renamed
 * vendor key or a new side on the backend would pass the build. This checks
 * every entry against the shape the kit reads at runtime.
 */
import { describe, expect, it } from "vitest";

import { symbolSchemas } from "./symbolSchemas";
import type { Side } from "./types";

const SIDES: readonly Side[] = ["+x", "-x", "+y", "-y", "+z", "-z"];

describe("symbolSchemas", () => {
  it("carries the whole type contract for every type", () => {
    for (const [name, schema] of Object.entries(symbolSchemas)) {
      expect(schema.title).toBe(name);
      expect(
        schema["x-footprint"] === null ||
          (typeof schema["x-footprint"].w === "number" &&
            typeof schema["x-footprint"].d === "number"),
      ).toBe(true);
      expect(typeof schema["x-inline"]).toBe("boolean");
      expect(typeof schema["x-ports-authored"]).toBe("boolean");
      expect(typeof schema["x-rotation-locked"]).toBe("boolean");
      expect(Array.isArray(schema["x-slots"])).toBe(true);
      expect(Array.isArray(schema["x-required-slots"])).toBe(true);
      for (const port of Object.values(schema["x-ports"])) {
        expect(SIDES).toContain(port.side);
        expect(typeof port.offset.x).toBe("number");
        expect(typeof port.offset.y).toBe("number");
      }
    }
  });

  it("publishes the collector with authored ports and no footprint", () => {
    const collector = symbolSchemas.collector!;
    expect(collector["x-ports-authored"]).toBe(true);
    expect(collector["x-footprint"]).toBeNull();
    expect(collector["x-ports"]).toEqual({});
  });
});
