import { useEffect, useRef, useState } from "react";
import {
  LOOP_SECONDS,
  type ScenarioState,
  computeScenarioState,
} from "../data/scenario";

type Options = {
  paused: boolean;
  /** Bumping this value resets the scenario clock to 0. */
  restartToken: number;
};

/**
 * Drives the demo telemetry clock. Returns the current `ScenarioState`,
 * which is recomputed on a ~10 Hz cadence and on every restart token bump.
 *
 * The clock is decoupled from the WebGL render loop on purpose: telemetry
 * smoothness is bounded by data, not framerate, so 10 Hz keeps the React
 * reconciliation cheap while still feeling 'live'.
 */
export function useFakedTelemetry({
  paused,
  restartToken,
}: Options): ScenarioState {
  const [state, setState] = useState<ScenarioState>(() =>
    computeScenarioState(0),
  );
  const timeRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  // Reset clock on restart.
  useEffect(() => {
    timeRef.current = 0;
    lastTickRef.current = null;
    setState(computeScenarioState(0));
  }, [restartToken]);

  useEffect(() => {
    if (paused) {
      lastTickRef.current = null;
      return;
    }
    let cancelled = false;
    const interval = window.setInterval(() => {
      if (cancelled) return;
      const now = performance.now();
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const dt = (now - last) / 1000;
      timeRef.current = (timeRef.current + dt) % LOOP_SECONDS;
      setState(computeScenarioState(timeRef.current));
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [paused]);

  return state;
}
