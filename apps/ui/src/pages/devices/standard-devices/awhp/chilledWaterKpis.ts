import type { MergedRow } from "@/lib/mergeTimeSeries";

export type ChilledWaterKpis = {
  /** Time-weighted mean of |outlet − setpoint| over the window, in °C. */
  meanDeviation: number | null;
  /** Total time the unit spent on over the window, in seconds. */
  runSeconds: number | null;
  /** Energy consumed over the window (counter delta), in kWh. */
  energyKwh: number | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * KPIs for the chilled-water card, computed from the merged 24 h timeline.
 *
 * Rows are recorded on change, not sampled uniformly, so a plain row average
 * would over-weight busy periods: each row's values are instead held for the
 * interval up to the next row and weighted by that duration (the final row
 * is the `holdLastRowUntil` sentinel spanning to now).
 *
 * A KPI whose backing metric the device never records is null — hidden by
 * the card. The energy counter is cumulative; a delta that comes out
 * negative (counter reset mid-window) is null rather than garbage.
 */
export function computeChilledWaterKpis(rows: MergedRow[]): ChilledWaterKpis {
  let deviationSum = 0;
  let deviationWeight = 0;
  let runMs = 0;
  let hasOnoff = false;
  let firstEnergy: number | null = null;
  let lastEnergy: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const values = rows[i].values;
    if (typeof values.onoff_state === "boolean") hasOnoff = true;
    const energy = num(values.energy);
    if (energy != null) {
      firstEnergy ??= energy;
      lastEnergy = energy;
    }

    if (i === rows.length - 1) break;
    const dt =
      new Date(rows[i + 1].timestamp).getTime() -
      new Date(rows[i].timestamp).getTime();

    const outlet = num(values.outlet_temperature);
    const setpoint = num(values.setpoint_temperature);
    if (outlet != null && setpoint != null) {
      deviationSum += Math.abs(outlet - setpoint) * dt;
      deviationWeight += dt;
    }
    if (values.onoff_state === true) runMs += dt;
  }

  const energyDelta =
    firstEnergy != null && lastEnergy != null ? lastEnergy - firstEnergy : null;

  return {
    meanDeviation: deviationWeight > 0 ? deviationSum / deviationWeight : null,
    runSeconds: hasOnoff ? runMs / 1000 : null,
    energyKwh: energyDelta != null && energyDelta >= 0 ? energyDelta : null,
  };
}

/** "9 h 05" — whole hours and zero-padded minutes, rounded to the minute. */
export function formatRunHours(seconds: number): string {
  let h = Math.floor(seconds / 3600);
  let m = Math.round((seconds % 3600) / 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${h} h ${String(m).padStart(2, "0")}`;
}
