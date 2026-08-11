import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readStoredRefreshInterval,
  writeStoredRefreshInterval,
} from "./refreshPreference";

// Node 25 ships a broken global localStorage that shadows jsdom's (see
// lessons: setItem is a no-op without --localstorage-file). A Map-backed
// stand-in keeps this spec deterministic across Node versions.
const original = Object.getOwnPropertyDescriptor(window, "localStorage");
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
    },
  });
});

afterEach(() => {
  if (original) Object.defineProperty(window, "localStorage", original);
});

describe("refreshPreference", () => {
  it("round-trips a stored cadence", () => {
    writeStoredRefreshInterval(60_000);
    expect(readStoredRefreshInterval()).toBe(60_000);
  });

  it("defaults to off when nothing is stored", () => {
    expect(readStoredRefreshInterval()).toBe(0);
  });

  it.each(["7000", "banana", ""])(
    "falls back to off on a tampered value (%s)",
    (raw) => {
      store.set("device-history-refresh", raw);
      expect(readStoredRefreshInterval()).toBe(0);
    },
  );

  it("survives storage being unavailable", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    expect(readStoredRefreshInterval()).toBe(0);
    expect(() => writeStoredRefreshInterval(10_000)).not.toThrow();
  });
});
