import type { AttributeFields } from "@/lib/faults";

/** HVAC modes the UI can render (icon + label + semantic colour), in
 *  canonical display order. */
export const SUPPORTED_MODES = ["heat", "cool", "auto", "fan", "dry"] as const;

/** Offered when the mode attribute declares no `value_options` — the common
 *  trio every thermostat driver supports. */
const FALLBACK_MODES = ["heat", "cool", "auto"];

/**
 * The mode values the segmented control offers, in canonical order.
 *
 * The backend leaves mode values driver-defined: when the attribute carries
 * `value_options`, the control offers their intersection with the modes the
 * UI can render (unknown wire values are dropped — they have no icon, label
 * or colour). Without options, it falls back to heat/cool/auto.
 */
export function resolveModeOptions(
  modeAttr: AttributeFields | undefined,
): string[] {
  const options = modeAttr?.value_options;
  if (!options || options.length === 0) return FALLBACK_MODES;
  return SUPPORTED_MODES.filter((mode) => options.includes(mode));
}
