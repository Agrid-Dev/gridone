import { describe, expect, it } from "vitest";
import {
  attributeValueChartColor,
  lookupSemanticColor,
  semanticChartColor,
  SEMANTIC_TEXT_CLASS,
  SEVERITY_LEVEL,
} from "./semanticColors";

describe("semantic colour registry", () => {
  // AC: thermostat/awhp `mode` history is coloured by HVAC meaning.
  it("maps HVAC modes to their semantic tokens", () => {
    expect(lookupSemanticColor("mode", "heat")).toBe("hvacHeat");
    expect(lookupSemanticColor("mode", "cool")).toBe("hvacCool");
    expect(lookupSemanticColor("mode", "fan")).toBe("hvacFan");
    expect(lookupSemanticColor("mode", "auto")).toBe("hvacAuto");
  });

  // AC: connection status history shares the badge's colour map. The badge maps
  // ok→ok, degraded→warning, error→error, idle→info via the same tokens.
  it("maps connection status to the shared status tokens", () => {
    expect(lookupSemanticColor("connection_status", "ok")).toBe("ok");
    expect(lookupSemanticColor("connection_status", "degraded")).toBe(
      "warning",
    );
    expect(lookupSemanticColor("connection_status", "error")).toBe("error");
    expect(lookupSemanticColor("connection_status", "idle")).toBe("info");
  });

  it("returns undefined for unregistered attributes and values", () => {
    expect(lookupSemanticColor("humidity", "42")).toBeUndefined();
    expect(lookupSemanticColor("mode", "eco")).toBeUndefined();
    expect(attributeValueChartColor("humidity", "42")).toBeUndefined();
  });

  it("resolves tokens to a theme-backed chart colour", () => {
    expect(attributeValueChartColor("mode", "heat")).toBe(
      "hsl(var(--hvac-heat))",
    );
    expect(semanticChartColor("ok")).toBe("hsl(var(--status-ok))");
  });

  it("keeps every severity mapped to an inline text class", () => {
    for (const severity of ["alert", "warning", "info"] as const) {
      expect(SEMANTIC_TEXT_CLASS[SEVERITY_LEVEL[severity]]).toMatch(
        /^text-status-/,
      );
    }
  });
});
