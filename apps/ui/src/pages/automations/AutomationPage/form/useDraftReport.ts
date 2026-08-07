import { useEffect, useRef } from "react";

/**
 * Report a sub-form's current value upward as the user types, so a parent can
 * aggregate several always-editable sub-forms behind a single Save instead of
 * submitting each one. `null` means "not usable yet" — incomplete or invalid.
 *
 * Values are compared by their JSON serialization: form bodies rebuild their
 * result object on every render, so an identity check would fire the callback
 * (and re-render the parent) on every keystroke. `onChange` must be stable —
 * wrap it in `useCallback` — or the effect re-runs on every parent render.
 */
export function useDraftReport<T>(
  value: T | null,
  onChange?: (value: T | null) => void,
) {
  const latest = useRef(value);
  latest.current = value;
  const serialized = value === null ? null : JSON.stringify(value);

  useEffect(() => {
    onChange?.(latest.current);
  }, [serialized, onChange]);
}
