import { beforeEach, describe, expect, it } from "vitest";
import {
  mergePanelOrder,
  readStoredPanelOrder,
  writeStoredPanelOrder,
} from "./panelOrder";

describe("stored panel order", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Node 25 exposes a broken global localStorage; the helpers guard it.
    }
  });

  it("round-trips per device", () => {
    writeStoredPanelOrder("d1", ["mode", "float:°"]);
    expect(readStoredPanelOrder("d1")).toEqual(["mode", "float:°"]);
    expect(readStoredPanelOrder("d2")).toBeNull();
  });

  it("ignores a store holding something else", () => {
    localStorage.setItem("device-history-panels:d1", '{"not":"a list"}');
    expect(readStoredPanelOrder("d1")).toBeNull();
    localStorage.setItem("device-history-panels:d1", "[1, 2]");
    expect(readStoredPanelOrder("d1")).toBeNull();
  });
});

describe("mergePanelOrder", () => {
  it("takes the shown order as is when every remembered panel is shown", () => {
    expect(mergePanelOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("keeps a hidden panel next to the shown neighbour it followed", () => {
    // Arranged [mode, °C, %], mode deselected, the unit panels swapped.
    expect(
      mergePanelOrder(["mode", "float:°C", "float:%"], ["float:%", "float:°C"]),
    ).toEqual(["mode", "float:%", "float:°C"]);
    expect(
      mergePanelOrder(["float:°C", "mode", "float:%"], ["float:%", "float:°C"]),
    ).toEqual(["float:%", "float:°C", "mode"]);
  });

  it("keeps hidden panels in their own order when several follow one neighbour", () => {
    expect(mergePanelOrder(["a", "x", "y", "b"], ["b", "a"])).toEqual([
      "b",
      "a",
      "x",
      "y",
    ]);
  });

  it("appends panels never remembered after the shown ones", () => {
    expect(mergePanelOrder(["a"], ["b", "a", "c"])).toEqual(["b", "a", "c"]);
  });
});
