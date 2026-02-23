import type { Series } from "../types";

/** 10 timestamps, 1 minute apart starting at 2025-01-01T00:00:00Z */
export const timestamps = Array.from(
  { length: 10 },
  (_, i) => new Date("2025-01-01T00:00:00Z").getTime() + i * 60_000,
).map((ms) => new Date(ms));

// ---------------------------------------------------------------------------
// Float series — two sensors with numeric readings
// ---------------------------------------------------------------------------

export const floatSeries: Series[] = [
  { key: "temperature", label: "Temperature" },
  { key: "humidity", label: "Humidity" },
];

export const floatValues: Record<string, (number | null)[]> = {
  temperature: [20.1, 20.3, 20.5, null, 21.0, 21.2, 21.5, 21.3, 21.0, 20.8],
  humidity: [45.0, 45.5, 46.0, 46.2, 46.5, null, 47.0, 47.5, 48.0, 48.5],
};

// ---------------------------------------------------------------------------
// Boolean series — one on/off flag
// ---------------------------------------------------------------------------

export const booleanSeries: Series[] = [
  { key: "heater_on", label: "Heater On" },
];

export const booleanValues: Record<string, (boolean | null)[]> = {
  heater_on: [false, false, true, true, true, false, false, true, true, null],
};

// ---------------------------------------------------------------------------
// String series — one categorical status
// ---------------------------------------------------------------------------

export const stringSeries: Series[] = [{ key: "mode", label: "Mode" }];

export const stringValues: Record<string, (string | null)[]> = {
  mode: [
    "idle",
    "idle",
    "heating",
    "heating",
    "cooling",
    "cooling",
    "idle",
    null,
    "heating",
    "heating",
  ],
};
