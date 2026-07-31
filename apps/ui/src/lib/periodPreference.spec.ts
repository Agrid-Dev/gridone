import { afterEach, describe, it, expect, vi } from "vitest";
import { readStoredPreset, writeStoredPreset } from "./periodPreference";

const KEY = "test.period";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("periodPreference", () => {
  it("round-trips a preset", () => {
    writeStoredPreset(KEY, "3mo");
    expect(readStoredPreset(KEY)).toBe("3mo");
  });

  it("returns null when nothing was stored", () => {
    expect(readStoredPreset(KEY)).toBeNull();
  });

  // Storage is user-writable, so a value that is no longer a preset (a removed
  // one, a hand-edited entry) must read as absent rather than reach the URL.
  it("rejects a stored value that is not a preset", () => {
    window.localStorage.setItem(KEY, "42y");
    expect(readStoredPreset(KEY)).toBeNull();
  });

  it("survives storage being unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeStoredPreset(KEY, "7d")).not.toThrow();
    expect(readStoredPreset(KEY)).toBeNull();
  });
});
