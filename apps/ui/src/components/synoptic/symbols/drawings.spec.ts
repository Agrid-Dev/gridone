import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAWINGS } from "./drawings";

/** The visual language spec, whose "Standard references" table is the
 *  reader's copy of what each glyph declares. Resolved from this file, so
 *  the runner's working directory is moot. */
const SPEC = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../../../../docs/specs/synoptic-visual-language.md",
  ),
  "utf8",
);

const table = () => {
  const start = SPEC.indexOf("## Standard references");
  const end = SPEC.indexOf("\n## ", start + 1);
  return SPEC.slice(start, end);
};

describe("plan glyph standard references", () => {
  it("declares the standard symbol every glyph is drawn after", () => {
    for (const [type, drawing] of Object.entries(DRAWINGS)) {
      expect(drawing.standard?.ref, type).toMatch(/^ISO 1(4617|0628)/);
    }
  });

  it("is listed, type and reference, in the spec's table, so the doc says what the code draws", () => {
    const rows = table();
    for (const [type, drawing] of Object.entries(DRAWINGS)) {
      const row = rows
        .split("\n")
        .find((line) => line.startsWith(`| \`${type}\` |`));
      expect(row, `row for ${type}`).toBeDefined();
      expect(row, `reference of ${type}`).toContain(
        `| ${drawing.standard.ref} |`,
      );
    }
  });

  it("names no type in the table the kit does not draw, except the collector", () => {
    const listed = [...table().matchAll(/^\| `([a-z_]+)` \|/gm)].map(
      (m) => m[1],
    );
    expect(listed.filter((t) => t !== "collector").sort()).toEqual(
      Object.keys(DRAWINGS).sort(),
    );
  });
});
