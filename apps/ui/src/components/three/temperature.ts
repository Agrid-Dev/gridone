/**
 * Comfort-gradient coloring for room temperatures.
 *
 * Colors travel through the theme tokens `--hvac-cool` → `--status-ok` →
 * `--hvac-heat` over the 16 °C → 22 °C → 28 °C range, clamped at both ends.
 * Tokens are bare HSL triplets (e.g. `"217 91% 60%"`), matching index.css.
 */

export type HslTriplet = [number, number, number];

export const TEMP_COOL_C = 16;
export const TEMP_COMFORT_C = 22;
export const TEMP_HEAT_C = 28;

/**
 * Parses a bare HSL triplet like `"217 91% 60%"` (as stored in the CSS
 * custom properties) into `[217, 91, 60]`. Returns null on malformed input.
 */
export function parseHslTriplet(raw: string): HslTriplet | null {
  const match = raw
    .trim()
    .match(/^([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%$/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function hslToCss([h, s, l]: HslTriplet): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates hue along the shortest arc so blends never loop the wheel. */
export function lerpHsl(a: HslTriplet, b: HslTriplet, t: number): HslTriplet {
  let dh = b[0] - a[0];
  if (dh > 180) {
    dh -= 360;
  } else if (dh < -180) {
    dh += 360;
  }
  return [
    (a[0] + dh * t + 360) % 360,
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

/**
 * Maps a room temperature onto the comfort gradient. Below 16 °C the color
 * saturates to `cool`, above 28 °C to `heat`, 22 °C is exactly `ok`.
 */
export function temperatureHsl(
  tempC: number,
  cool: HslTriplet,
  ok: HslTriplet,
  heat: HslTriplet,
): HslTriplet {
  if (tempC <= TEMP_COOL_C) {
    return cool;
  }
  if (tempC >= TEMP_HEAT_C) {
    return heat;
  }
  if (tempC <= TEMP_COMFORT_C) {
    return lerpHsl(
      cool,
      ok,
      (tempC - TEMP_COOL_C) / (TEMP_COMFORT_C - TEMP_COOL_C),
    );
  }
  return lerpHsl(
    ok,
    heat,
    (tempC - TEMP_COMFORT_C) / (TEMP_HEAT_C - TEMP_COMFORT_C),
  );
}
