import { useState } from "react";
import type { BoundControlState } from "./useDeviceControlRuntime";

/** `value` as of the last render where `hold` was false, for as long as it is true. */
function useHeld<T>(value: T, hold: boolean): T {
  const [held, setHeld] = useState(value);
  if (!hold && JSON.stringify(held) !== JSON.stringify(value)) setHeld(value);
  return hold ? held : value;
}

/**
 * The dependencies a write this page sent made unknown, and `shown` as it was
 * before, kept while that write is in flight. A dependency already missing
 * before the write is not awaited: its gap is real.
 */
export function useAwaitedWrite<T>(
  state: BoundControlState,
  shown: T,
): { awaiting: string[]; shown: T } {
  const missing = state.attribute?.write_state?.missing_attributes ?? [];
  const inFlight = state.inFlight ?? [];
  const before = useHeld(missing, inFlight.length > 0);
  const awaiting = inFlight.filter((name) => !before.includes(name));
  return { awaiting, shown: useHeld(shown, awaiting.length > 0) };
}
