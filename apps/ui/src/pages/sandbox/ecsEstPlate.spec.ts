import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ecsEstPlate from "./ecsEstPlate.json";

/** Resolved from this file, so the runner's working directory is moot. */
const SPEC_PLATE = resolve(
  import.meta.dirname,
  "../../../../../docs/specs/synoptic/ecs-est.json",
);

describe("ecsEstPlate fixture", () => {
  it("is the reference plate of the document spec, verbatim", () => {
    expect(ecsEstPlate).toEqual(JSON.parse(readFileSync(SPEC_PLATE, "utf8")));
  });
});
