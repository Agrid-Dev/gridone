import { useEffect, useState } from "react";

/** Re-renders the component on a fixed interval; returns the tick count. Drives live simulations. */
export function useTicker(intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

/** Random-walk a value by at most `maxStep`, clamped to [min, max]. */
export function drift(
  value: number,
  min: number,
  max: number,
  maxStep: number,
): number {
  const next = value + (Math.random() * 2 - 1) * maxStep;
  return Math.min(max, Math.max(min, next));
}
