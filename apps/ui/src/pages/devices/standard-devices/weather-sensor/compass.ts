const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type CompassDirection = (typeof DIRECTIONS)[number];

/**
 * Converts degrees (0–360) to an 8-point compass direction.
 *
 * 0° = N, 45° = NE, 90° = E, etc. Each sector spans 45°.
 * Returns null for null input.
 */
export function degreesToCompass(
  degrees: number | null,
): CompassDirection | null {
  if (degrees == null) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return DIRECTIONS[index];
}
