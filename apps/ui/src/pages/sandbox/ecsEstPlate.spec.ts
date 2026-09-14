import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import ecsEstPlate from "./ecsEstPlate.json";

/** Vitest runs from `apps/ui`. */
const SPEC_PLATE = resolve(cwd(), "../../docs/specs/synoptic/ecs-est.json");

describe("ecsEstPlate fixture", () => {
  it("is the reference plate of the document spec, verbatim", () => {
    expect(ecsEstPlate).toEqual(JSON.parse(readFileSync(SPEC_PLATE, "utf8")));
  });
});
