import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  landingSynopticId,
  readDefaultSynoptic,
  readLastSynoptic,
  writeDefaultSynoptic,
  writeLastSynoptic,
} from "./synopticPreference";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("landingSynopticId", () => {
  const IDS = ["ecs", "west", "cta"];

  it("opens the pinned plate over the last one seen", () => {
    expect(landingSynopticId(IDS, { pinned: "cta", last: "west" })).toBe("cta");
  });

  it("opens the last plate seen when nothing is pinned", () => {
    expect(landingSynopticId(IDS, { pinned: null, last: "west" })).toBe("west");
  });

  it("skips a pinned plate that was deleted and falls back to the last seen", () => {
    expect(landingSynopticId(IDS, { pinned: "gone", last: "cta" })).toBe("cta");
  });

  it("opens the first plate in list order when both remembered ids are stale", () => {
    expect(
      landingSynopticId(["west", "ecs"], { pinned: "gone", last: "old" }),
    ).toBe("west");
  });

  it("opens the first plate in list order when nothing is remembered", () => {
    expect(
      landingSynopticId(["cta", "ecs"], { pinned: null, last: null }),
    ).toBe("cta");
  });

  it("opens nothing when no plate is stored, whatever is remembered", () => {
    expect(landingSynopticId([], { pinned: "ecs", last: "west" })).toBeNull();
  });
});

describe("synoptic preference storage", () => {
  it("round-trips the last plate seen under its own key", () => {
    writeLastSynoptic("west");
    expect(readLastSynoptic()).toBe("west");
    expect(window.localStorage.getItem("gridone.synoptics.last")).toBe("west");
    expect(readDefaultSynoptic()).toBeNull();
  });

  it("round-trips the pinned plate under its own key", () => {
    writeDefaultSynoptic("cta");
    expect(readDefaultSynoptic()).toBe("cta");
    expect(window.localStorage.getItem("gridone.synoptics.default")).toBe(
      "cta",
    );
    expect(readLastSynoptic()).toBeNull();
  });

  it("unpins by removing the key rather than storing a value", () => {
    window.localStorage.setItem("gridone.synoptics.default", "cta");
    writeDefaultSynoptic(null);
    expect(window.localStorage.getItem("gridone.synoptics.default")).toBeNull();
    expect(readDefaultSynoptic()).toBeNull();
  });

  it("reads an empty stored value as nothing remembered", () => {
    window.localStorage.setItem("gridone.synoptics.last", "");
    expect(readLastSynoptic()).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    const denied = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(denied);

    expect(readLastSynoptic()).toBeNull();
    expect(readDefaultSynoptic()).toBeNull();
    expect(() => writeLastSynoptic("west")).not.toThrow();
    expect(() => writeDefaultSynoptic("cta")).not.toThrow();
    expect(() => writeDefaultSynoptic(null)).not.toThrow();
  });
});
