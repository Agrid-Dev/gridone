import { beforeEach, describe, expect, it } from "vitest";
import {
  canonicalSelection,
  parseSelectionParam,
  readStoredSelection,
  sameSelection,
  serializeSelection,
  writeStoredSelection,
} from "./selection";

const available = ["temperature", "temperature_setpoint", "mode"];

describe("parseSelectionParam", () => {
  it("returns null when the URL carries no selection", () => {
    expect(parseSelectionParam(null, available)).toBeNull();
  });

  it("reads an explicit empty parameter as an empty selection", () => {
    expect(parseSelectionParam("", available)).toEqual([]);
  });

  it("keeps the names in the device's order, whatever the URL order", () => {
    expect(parseSelectionParam("mode,temperature", available)).toEqual([
      "temperature",
      "mode",
    ]);
  });

  it("drops names the device does not expose", () => {
    expect(parseSelectionParam("bogus,mode", available)).toEqual(["mode"]);
  });

  it("returns null when nothing named is exposed", () => {
    expect(parseSelectionParam("bogus", available)).toBeNull();
  });
});

describe("selection helpers", () => {
  it("round-trips through the URL parameter", () => {
    const param = serializeSelection(["temperature", "mode"]);
    expect(parseSelectionParam(param, available)).toEqual([
      "temperature",
      "mode",
    ]);
  });

  it("canonicalises a selection to the device's order", () => {
    expect(canonicalSelection(["mode", "temperature", "x"], available)).toEqual(
      ["temperature", "mode"],
    );
  });

  it("compares selections by content", () => {
    expect(sameSelection(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameSelection(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameSelection(["a"], ["a", "b"])).toBe(false);
  });
});

describe("stored selection", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Node 25 exposes a broken global localStorage; the helpers guard it.
    }
  });

  it("round-trips per device", () => {
    writeStoredSelection("d1", ["temperature", "mode"]);
    expect(readStoredSelection("d1")).toEqual(["temperature", "mode"]);
    expect(readStoredSelection("d2")).toBeNull();
  });

  it("ignores a store holding something else", () => {
    localStorage.setItem("device-history-attrs:d1", '{"not":"a list"}');
    expect(readStoredSelection("d1")).toBeNull();
    localStorage.setItem("device-history-attrs:d1", "not json");
    expect(readStoredSelection("d1")).toBeNull();
  });
});
