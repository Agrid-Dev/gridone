import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Location } from "react-router";
import {
  RESOURCE_SECTIONS,
  canonicalList,
  clearNavigation,
  flushNavigation,
  markResourceDeleted,
  navigationStore,
  resourcePath,
  saveEntry,
  type NavigationEntry,
} from "./navigation";

const STORAGE_KEY = "gridone.navigation";

function locationAt(index: number) {
  return {
    key: `k${index}`,
    pathname: `/devices/d${index}`,
    search: "",
    hash: "",
    state: null,
  } as unknown as Location;
}

function entryAt(index: number): NavigationEntry {
  return {
    url: `/devices/d${index}`,
    index,
    context: { visit: `visit-${index}` },
    values: {},
  };
}

function writes(calls: unknown[][]) {
  return calls.filter(([key]) => key === STORAGE_KEY).length;
}

describe("navigation store", () => {
  let setItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearNavigation();
    vi.useFakeTimers();
    setItem = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearNavigation();
  });

  // Scroll capture saves on every tick; serialising the whole store each time was
  // a synchronous write per tick on a long list.
  it("collapses a burst of saves into a single write", () => {
    for (let index = 0; index < 8; index += 1)
      saveEntry(locationAt(1), {
        ...entryAt(1),
        scroll: { page: [0, index], containers: {} },
      });

    expect(writes(setItem.mock.calls)).toBe(0);

    flushNavigation();

    expect(writes(setItem.mock.calls)).toBe(1);
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(stored.entries.k1.scroll.page).toEqual([0, 7]);
  });

  it("writes a scheduled save on its own once the burst stops", () => {
    saveEntry(locationAt(1), entryAt(1));

    expect(writes(setItem.mock.calls)).toBe(0);

    vi.advanceTimersByTime(1_000);

    expect(writes(setItem.mock.calls)).toBe(1);
  });

  // Signing out clears the store: a write scheduled just before must not resurrect it.
  it("drops a scheduled write when navigation is cleared", () => {
    saveEntry(locationAt(1), entryAt(1));
    clearNavigation();
    vi.advanceTimersByTime(1_000);

    expect(writes(setItem.mock.calls)).toBe(0);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps the recent tail and forgets what nothing points to", () => {
    for (let index = 0; index < 62; index += 1)
      saveEntry(locationAt(index), entryAt(index));

    const keys = Object.keys(navigationStore.entries);
    expect(keys.length).toBeLessThanOrEqual(50);
    expect(navigationStore.entries.k61).toBeDefined();
    expect(navigationStore.entries.k0).toBeUndefined();
    expect(Object.values(navigationStore.history)).toEqual(
      expect.arrayContaining(["k61"]),
    );
    expect(Object.values(navigationStore.history)).not.toContain("k0");
    expect(navigationStore.tabs["visit-61"]).toBeDefined();
    expect(navigationStore.tabs["visit-0"]).toBeUndefined();
  });

  it("records a deleted resource once and bounds the list", () => {
    markResourceDeleted("/devices/a");
    markResourceDeleted("/devices/a");

    expect(navigationStore.deleted).toEqual(["/devices/a"]);

    for (let index = 0; index < 60; index += 1)
      markResourceDeleted(`/devices/gone-${index}`);

    expect(navigationStore.deleted.length).toBeLessThanOrEqual(50);
    expect(navigationStore.deleted).toContain("/devices/gone-59");
  });

  it("keeps in-memory state when the storage refuses the write", () => {
    setItem.mockImplementation(() => {
      throw new Error("quota");
    });
    saveEntry(locationAt(1), entryAt(1));

    expect(() => flushNavigation()).not.toThrow();
    expect(navigationStore.entries.k1).toBeDefined();
  });
});

const PAGES = resolve(import.meta.dirname, "../pages");

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".spec.tsx")
      ? [path]
      : [];
  });
}

/** First segment of every literal path the section routes, e.g. `commands/new` → `commands`. */
function routedSegments(family: string) {
  const segments = new Set<string>();
  for (const file of routeFiles(resolve(PAGES, family)))
    for (const [, path] of readFileSync(file, "utf8").matchAll(
      /path="([^"]+)"/g,
    )) {
      const first = path.replace(/^\//, "").split("/")[0];
      if (first && first !== "*" && !first.startsWith(":")) segments.add(first);
    }
  return [...segments].sort();
}

describe("resource sections", () => {
  // The return contract reads `/<family>/<id>`: a segment the section routes is a page,
  // never an id. Adding one without declaring it here is the drift this pins.
  it.each(Object.keys(RESOURCE_SECTIONS))(
    "declares every segment routed under /%s",
    (family) => {
      expect([...RESOURCE_SECTIONS[family]].sort()).toEqual(
        routedSegments(family),
      );
    },
  );

  it("reads an id, and never a page, as a resource", () => {
    expect(resourcePath("/devices/abcd1234abcd1234/history")).toBe(
      "/devices/abcd1234abcd1234",
    );
    expect(resourcePath("/devices/commands")).toBeNull();
    expect(resourcePath("/devices/zone-mapping/import")).toBeNull();
    expect(resourcePath("/devices/views/v1")).toBe("/devices/views/v1");
    expect(resourcePath("/devices/views/new")).toBeNull();
    expect(resourcePath("/users/a")).toBeNull();
  });

  it("keeps operating rule detail and edit navigation separate from its parent device", () => {
    for (const suffix of ["", "/edit"]) {
      const path = `/devices/a/config/operating-rules/rule${suffix}`;
      expect(resourcePath(path)).toBe("/devices/a/config/operating-rules/rule");
      expect(canonicalList(path)).toBe("/devices/a/config/operating-rules");
    }
    expect(resourcePath("/devices/a/config/operating-rules")).toBe(
      "/devices/a",
    );
    expect(resourcePath("/devices/a/config/operating-rules/new")).toBe(
      "/devices/a",
    );
  });
});
