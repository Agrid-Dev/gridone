import { useCallback, useMemo, useReducer, type SetStateAction } from "react";
import { useLocation } from "react-router";
import { currentEntry, saveEntry } from "@/lib/navigation";

/** For view state only. Forms, pending mutations and dialogs must never use this hook. */
export function useEntryState<T>(name: string, initial: T | (() => T)) {
  const location = useLocation();
  const [, render] = useReducer((value: number) => value + 1, 0);
  const fallback = useMemo(
    () => (typeof initial === "function" ? (initial as () => T)() : initial),
    [location.key],
  );
  const entry = currentEntry(location);
  const value = (entry.values[name] as T | undefined) ?? fallback;
  const set = useCallback(
    (next: SetStateAction<T>) => {
      const latest = currentEntry(location);
      const current = (latest.values[name] as T | undefined) ?? fallback;
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(current) : next;
      latest.values[name] = resolved;
      saveEntry(location, latest);
      render();
    },
    [location, name, fallback],
  );
  return [value, set] as const;
}
