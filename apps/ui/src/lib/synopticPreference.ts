/**
 * Which synoptic `/synoptics` opens on: the one the user pinned as the page's
 * default, else the last one they looked at, else the first stored.
 *
 * Same guard rails as the other preferences: storage can be unavailable
 * (private browsing, disabled quota) and its contents are user-writable, so
 * every access is wrapped and a stored id counts only while it still names a
 * stored plate. Losing the preference lands on the first plate; it is never a
 * reason to fail a render.
 */

const LAST_KEY = "gridone.synoptics.last";
const DEFAULT_KEY = "gridone.synoptics.default";
const LEGEND_KEY = "gridone.synoptics.legend";
const NAV_KEY = "gridone.synoptics.nav";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function write(key: string, id: string | null): void {
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    // Preference is a convenience; a full or disabled store is not an error.
  }
}

export const readLastSynoptic = () => read(LAST_KEY);
export const writeLastSynoptic = (id: string) => write(LAST_KEY, id);
export const readDefaultSynoptic = () => read(DEFAULT_KEY);
/** `null` unpins: the page then opens on the last plate seen. */
export const writeDefaultSynoptic = (id: string | null) =>
  write(DEFAULT_KEY, id);

/** Whether the legend is unfolded over the plate: folded unless the user
 *  unfolded it last, so the drawing keeps the room by default. */
export const readLegendOpen = () => read(LEGEND_KEY) === "open";
export const writeLegendOpen = (open: boolean) =>
  write(LEGEND_KEY, open ? "open" : null);

/** Whether the equipment list stands beside the plate: open unless the
 *  user folded it last. */
export const readNavOpen = () => read(NAV_KEY) !== "closed";
export const writeNavOpen = (open: boolean) =>
  write(NAV_KEY, open ? null : "closed");

/** The plate to open among `ids` (the stored ones, in list order): the
 *  pinned one, else the last seen, else the first. `null` when none is
 *  stored. A remembered id whose plate was deleted is skipped. */
export function landingSynopticId(
  ids: readonly string[],
  remembered: { pinned: string | null; last: string | null },
): string | null {
  for (const id of [remembered.pinned, remembered.last]) {
    if (id && ids.includes(id)) return id;
  }
  return ids[0] ?? null;
}
