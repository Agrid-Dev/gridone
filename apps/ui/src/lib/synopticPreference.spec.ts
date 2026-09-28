import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  landingSynopticId,
  readDefaultSynoptic,
  readLastSynoptic,
  readLegendOpen,
  readNavOpen,
  readPreviewOpen,
  writeDefaultSynoptic,
  writeLastSynoptic,
  writeLegendOpen,
  writeNavOpen,
  writePreviewOpen,
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
    expect(readLegendOpen()).toBe(false);
    expect(() => writeLegendOpen(true)).not.toThrow();
  });

  it("keeps the legend folded until it is unfolded, and folds it back by removing the key", () => {
    expect(readLegendOpen()).toBe(false);
    writeLegendOpen(true);
    expect(readLegendOpen()).toBe(true);
    writeLegendOpen(false);
    expect(window.localStorage.getItem("gridone.synoptics.legend")).toBeNull();
    expect(readLegendOpen()).toBe(false);
  });

  it("stores the unfolded legend as the word `open`, under its own key", () => {
    writeLegendOpen(true);
    expect(window.localStorage.getItem("gridone.synoptics.legend")).toBe(
      "open",
    );
    expect(readLastSynoptic()).toBeNull();
    expect(readDefaultSynoptic()).toBeNull();
  });

  it.each(["", "closed", "true", "1", "OPEN"])(
    "reads the legend folded for any stored value but `open`: %j",
    (stored) => {
      window.localStorage.setItem("gridone.synoptics.legend", stored);
      expect(readLegendOpen()).toBe(false);
    },
  );

  it("reads the legend unfolded when `open` is stored", () => {
    window.localStorage.setItem("gridone.synoptics.legend", "open");
    expect(readLegendOpen()).toBe(true);
  });
});

describe("the equipment list", () => {
  it("stands open until it is folded, stores the fold as `closed`, and unfolding removes the key", () => {
    expect(readNavOpen()).toBe(true);
    writeNavOpen(false);
    expect(window.localStorage.getItem("gridone.synoptics.nav")).toBe("closed");
    expect(readNavOpen()).toBe(false);
    writeNavOpen(true);
    expect(window.localStorage.getItem("gridone.synoptics.nav")).toBeNull();
    expect(readNavOpen()).toBe(true);
  });

  it("reads anything but `closed` as open, and stays open when storage is unavailable", () => {
    window.localStorage.setItem("gridone.synoptics.nav", "open");
    expect(readNavOpen()).toBe(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readNavOpen()).toBe(true);
    expect(() => writeNavOpen(false)).not.toThrow();
  });
});

describe("the editor's 3D preview", () => {
  it("stands open until it is closed, and opening again removes the key", () => {
    expect(readPreviewOpen()).toBe(true);
    writePreviewOpen(false);
    expect(
      window.localStorage.getItem("gridone.synoptics.editor.preview"),
    ).toBe("closed");
    expect(readPreviewOpen()).toBe(false);
    writePreviewOpen(true);
    expect(
      window.localStorage.getItem("gridone.synoptics.editor.preview"),
    ).toBeNull();
  });
});
