import { describe, expect, it } from "vitest";
import { symbolSchemas } from "@gridone/sdk";
import { isInline, libraryGroups, matchesQuery, shelfOf } from "./library";

describe("libraryGroups", () => {
  it("files every registry type once, the inline ones on the pipe shelf", () => {
    const groups = libraryGroups();
    const filed = groups.flatMap((g) => g.types);
    expect(filed.sort()).toEqual(Object.keys(symbolSchemas).sort());
    const onPipe = groups.find((g) => g.id === "onPipe")!.types;
    // Mutant: filing by a fixed list would leave a new inline type on
    // "other", where nothing says it rides a run.
    expect(onPipe.sort()).toEqual(
      Object.keys(symbolSchemas)
        .filter((t) => symbolSchemas[t]["x-inline"])
        .sort(),
    );
    expect(onPipe).toContain("loop_heater");
  });

  it("orders the shelves and the common types first", () => {
    const groups = libraryGroups();
    expect(groups.map((g) => g.id)).toEqual([
      "production",
      "storage",
      "distribution",
      "onPipe",
      "navigation",
    ]);
    expect(groups[0].types).toEqual(["heat_pump", "plate_exchanger"]);
    expect(groups.find((g) => g.id === "onPipe")!.types.slice(0, 2)).toEqual([
      "pump",
      "pump_double",
    ]);
  });

  it("puts a type the library does not know on the last shelf", () => {
    expect(shelfOf("heat_recovery_wheel")).toBe("other");
    expect(libraryGroups(["tank", "zzz"]).map((g) => g.id)).toEqual([
      "storage",
      "other",
    ]);
  });
});

describe("isInline", () => {
  it("reads the registry", () => {
    expect(isInline("pump")).toBe(true);
    expect(isInline("tank")).toBe(false);
    expect(isInline("unknown")).toBe(false);
  });
});

describe("matchesQuery", () => {
  it("matches the name the author reads, accents and case aside", () => {
    expect(
      matchesQuery("loop_heater", "réchauffeur de boucle", "RECHAUF"),
    ).toBe(true);
    expect(matchesQuery("tank", "ballon", "vanne")).toBe(false);
  });

  it("matches the registry id too, with spaces for underscores", () => {
    expect(
      matchesQuery("plate_exchanger", "échangeur à plaques", "plate ex"),
    ).toBe(true);
  });

  it("lets everything through on an empty search", () => {
    expect(matchesQuery("tank", "ballon", "  ")).toBe(true);
  });
});
