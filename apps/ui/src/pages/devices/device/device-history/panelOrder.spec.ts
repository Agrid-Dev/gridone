import { beforeEach, describe, expect, it } from "vitest";
import { readStoredPanelOrder, writeStoredPanelOrder } from "./panelOrder";

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
