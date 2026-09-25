import { describe, expect, it } from "vitest";
import type { PipeElement, SymbolElement } from "@gridone/sdk";
import { capitalize, pipeName, symbolName } from "./names";

const TYPES: Record<string, string> = {
  pump: "pompe",
  heat_pump: "pompe à chaleur",
};
const typeLabel = (type: string) => TYPES[type] ?? type;
const FLUIDS: Record<string, string> = { primary_supply: "primaire départ" };
const fluidLabel = (fluid: string) => FLUIDS[fluid] ?? fluid;

const symbol = (id: string, type: string, label: string | null = null) =>
  ({
    id,
    type,
    label,
    placement: { kind: "cell", cell: { x: 0, y: 0 } },
  }) as SymbolElement;

describe("symbolName", () => {
  it("prefers the label the author wrote", () => {
    expect(symbolName(symbol("pump-2", "pump", " P2 "), typeLabel)).toBe("P2");
  });

  it("reads an editor-made id as the type and its number", () => {
    expect(symbolName(symbol("pump-2", "pump"), typeLabel)).toBe("Pompe 2");
    expect(symbolName(symbol("heat_pump-10", "heat_pump"), typeLabel)).toBe(
      "Pompe à chaleur 10",
    );
  });

  it("keeps a hand-written id as it is", () => {
    // `pac-03` ends with a number but was not made from its type.
    expect(symbolName(symbol("pac-03", "heat_pump"), typeLabel)).toBe("pac-03");
    expect(symbolName(symbol("pump", "pump"), typeLabel)).toBe("pump");
  });
});

describe("pipeName", () => {
  const pipe = (id: string) =>
    ({ id, fluid: "primary_supply" }) as unknown as PipeElement;

  it("reads an editor-made id as the fluid and its number", () => {
    expect(pipeName(pipe("primary_supply-3"), fluidLabel)).toBe(
      "Primaire départ 3",
    );
  });

  it("keeps a hand-written id as it is", () => {
    expect(pipeName(pipe("sec-supply"), fluidLabel)).toBe("sec-supply");
  });
});

describe("capitalize", () => {
  it("raises the first letter only", () => {
    expect(capitalize("échangeur à plaques")).toBe("Échangeur à plaques");
    expect(capitalize("")).toBe("");
  });
});
