import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { readStoredPreset, writeStoredPreset } from "@/lib/periodPreference";
import {
  type TimeRange,
  type TimeRangePreset,
  DEFAULT_PRESET,
  hasRangeParams,
  parseRangeParams,
  writeRangeParams,
} from "@/lib/timeRange";

type TimeRangeUrlStateOptions = {
  /** Preset shown when no time params are in the URL. */
  defaultPreset?: TimeRangePreset;
  /** Query params cleared whenever the range changes (e.g. ["page"]). */
  onChangeParamsReset?: string[];
  /** Opt in to remembering the picked preset under this key. Views without one
   *  keep their period for the lifetime of the URL only. */
  storageKey?: string;
};

/**
 * URL-first time-range state shared by every range control: parses
 * `?last=` / `?start=&end=`, writes changes back (the default preset produces
 * no params), and seeds a bare URL from the remembered preset when a
 * `storageKey` is provided.
 */
export function useTimeRangeUrlState({
  defaultPreset = DEFAULT_PRESET,
  onChangeParamsReset = [],
  storageKey,
}: TimeRangeUrlStateOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const timeRange = useMemo(
    () => parseRangeParams(searchParams, defaultPreset),
    [searchParams, defaultPreset],
  );

  const applyRange = useCallback(
    (range: TimeRange) => {
      setSearchParams(
        (prev) => {
          const next = writeRangeParams(prev, range, defaultPreset);
          for (const key of onChangeParamsReset) {
            next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    // `onChangeParamsReset` is a fresh array literal at every call site, so it
    // is depended on by contents rather than by identity — otherwise the
    // callback changes every render and the restore effect below re-fires.
    [setSearchParams, defaultPreset, onChangeParamsReset.join(",")],
  );

  // Seed a bare URL from the remembered preset. The URL stays the single source
  // of truth — restoring writes to it, so every reader agrees — and a link that
  // carries its own period always wins, which is what keeps a shared link
  // reproducing the view it was copied from. Replaces rather than pushes: the
  // preference is not a navigation the back button should undo.
  const remembered = storageKey ? readStoredPreset(storageKey) : null;
  const bareUrl = !hasRangeParams(searchParams);
  useEffect(() => {
    if (!bareUrl || !remembered || remembered === defaultPreset) return;
    applyRange({ kind: "preset", preset: remembered });
  }, [bareUrl, remembered, defaultPreset, applyRange]);

  const applyPreset = useCallback(
    (preset: TimeRangePreset) => {
      applyRange({ kind: "preset", preset });
      if (storageKey) writeStoredPreset(storageKey, preset);
    },
    [applyRange, storageKey],
  );

  return { timeRange, applyRange, applyPreset };
}
