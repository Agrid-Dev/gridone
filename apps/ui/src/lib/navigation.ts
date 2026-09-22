import type { Location } from "react-router";

export type ReturnOrigin = {
  url: string;
  name: string;
  named: boolean;
  pageTitle?: boolean;
  key: string;
  index: number;
  context?: ResourceNavigation;
};

export type ResourceNavigation = {
  visit: string;
  origin?: ReturnOrigin;
};

export type NavigationEntry = {
  url: string;
  index: number;
  context: ResourceNavigation;
  scroll?: {
    page: [number, number];
    containers: Record<string, [number, number]>;
  };
  focus?: { href: string; index: number };
  values: Record<string, unknown>;
};

type NavigationStore = {
  entries: Record<string, NavigationEntry>;
  history: Record<number, string>;
  tabs: Record<string, Record<string, string>>;
  deleted: string[];
  search?: string;
};

const STORAGE_KEY = "gridone.navigation";
/** A tab navigates far more than it ever returns, so only the recent tail is kept. */
const MAX_ENTRIES = 50;
const MAX_DELETED = 50;
/** Scroll capture saves on every tick; the in-memory store is what the tab reads. */
const PERSIST_DELAY_MS = 250;
const emptyStore = (): NavigationStore => ({
  entries: {},
  history: {},
  tabs: {},
  deleted: [],
});

function readStore(): NavigationStore {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      value?.entries &&
      value?.history &&
      value?.tabs &&
      Array.isArray(value?.deleted)
    )
      return value;
  } catch {
    /* Storage is optional, including in private browsing. */
  }
  return emptyStore();
}

export let navigationStore = readStore();

let pendingWrite: ReturnType<typeof setTimeout> | undefined;

function cancelWrite() {
  if (pendingWrite !== undefined) clearTimeout(pendingWrite);
  pendingWrite = undefined;
}

/** Schedule a write. Only a reload reads the storage back, so bursts collapse into one. */
export function persistNavigation() {
  pendingWrite ??= setTimeout(flushNavigation, PERSIST_DELAY_MS);
}

/** Write now: the tab is being hidden or replaced and a scheduled write would be lost. */
export function flushNavigation() {
  cancelWrite();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(navigationStore));
  } catch {
    /* Keep the in-memory state. */
  }
}

export function clearNavigation() {
  navigationStore = emptyStore();
  cancelWrite();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage is optional. */
  }
}

/** Drop the oldest entries, then whatever nothing points to any more. Losing an old
 *  entry costs a canonical fallback on return, never a wrong destination. */
function purgeEntries() {
  const keys = Object.keys(navigationStore.entries);
  if (keys.length <= MAX_ENTRIES) return;
  const oldest = keys
    .sort(
      (a, b) =>
        navigationStore.entries[a].index - navigationStore.entries[b].index,
    )
    .slice(0, keys.length - MAX_ENTRIES);
  for (const key of oldest) delete navigationStore.entries[key];
  for (const [index, key] of Object.entries(navigationStore.history))
    if (!navigationStore.entries[key])
      delete navigationStore.history[Number(index)];
  const visits = new Set(
    Object.values(navigationStore.entries).map((entry) => entry.context.visit),
  );
  for (const visit of Object.keys(navigationStore.tabs))
    if (!visits.has(visit)) delete navigationStore.tabs[visit];
}

/** Accept only app-relative URLs, rejecting protocol-relative URLs and backslash escapes. */
export function internalUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return null;
  try {
    const url = new URL(value, "https://gridone.local");
    return url.origin === "https://gridone.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : null;
  } catch {
    return null;
  }
}

/** The families whose detail pages share one return context, each with the literal child
 *  segments that are pages rather than resource ids. This is the only such list:
 *  `navigation.spec.ts` turns red when a section routes a segment missing here. */
export const RESOURCE_SECTIONS: Record<string, readonly string[]> = {
  devices: [
    "commands",
    "config",
    "edit",
    "history",
    "new",
    "operating-rules",
    "tags",
    "templates",
    "views",
    "zone-mapping",
  ],
  assets: ["new"],
  transports: ["new"],
  drivers: ["new"],
  automations: ["new"],
  dashboards: ["new"],
};

/** Identify one resource across its tabs/edit route, e.g. /devices/a/history → /devices/a. */
export function resourcePath(url: string): string | null {
  const path = internalUrl(url)?.split(/[?#]/)[0];
  if (!path) return null;
  const [list, first, second, third, fourth] = path.split("/").filter(Boolean);
  // A device view is a resource of its own, one level deeper than the others.
  if (list === "devices" && first === "views")
    return second && second !== "new" ? `/devices/views/${second}` : null;
  const reserved = RESOURCE_SECTIONS[list];
  if (!reserved || !first || reserved.includes(first)) return null;
  // A missing operatingRule must not mark its parent device as deleted.
  if (
    list === "devices" &&
    second === "config" &&
    third === "operating-rules" &&
    fourth &&
    fourth !== "new"
  )
    return `/devices/${first}/config/operating-rules/${fourth}`;
  return `/${list}/${first}`;
}

export function canonicalList(url: string): string {
  const resource = resourcePath(url);
  if (!resource) return "/";
  return resource.slice(0, resource.lastIndexOf("/"));
}

export function locationUrl(
  location: Pick<Location, "pathname" | "search" | "hash">,
) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function validOrigin(
  origin: ReturnOrigin | undefined,
  current: string,
): ReturnOrigin | undefined {
  const url = internalUrl(origin?.url);
  if (
    !url ||
    url === current ||
    (resourcePath(url) && resourcePath(url) === resourcePath(current))
  )
    return;
  if (navigationStore.deleted.includes(resourcePath(url) ?? url)) return;
  return origin;
}

export function markResourceDeleted(path: string) {
  if (!navigationStore.deleted.includes(path))
    navigationStore.deleted.push(path);
  if (navigationStore.deleted.length > MAX_DELETED)
    navigationStore.deleted = navigationStore.deleted.slice(-MAX_DELETED);
  persistNavigation();
}

export function currentEntry(location: Location): NavigationEntry {
  const saved = navigationStore.entries[location.key];
  return (
    (saved?.url === locationUrl(location) ? saved : undefined) ?? {
      url: locationUrl(location),
      index: window.history.state?.idx ?? 0,
      context: location.state?.resourceNavigation ?? { visit: location.key },
      values: {},
    }
  );
}

export function saveEntry(location: Location, entry: NavigationEntry) {
  navigationStore.entries[location.key] = entry;
  navigationStore.history[entry.index] = location.key;
  const path = resourcePath(entry.url);
  if (path) {
    const tabs = (navigationStore.tabs[entry.context.visit] ??= {});
    tabs[location.pathname] = location.search;
  }
  purgeEntries();
  persistNavigation();
}
