/**
 * Display unit for a device attribute: the one its driver declares, else the
 * one its name implies.
 *
 * Not every driver declares units, so the app also claims the ones its own
 * conventions already assume (see `formatValue.ts`): a scale-agnostic `°`
 * for temperatures, `%` for humidity. Anything else stays unitless rather
 * than guessing — a driver-defined `pressure` could be bar, Pa or PSI,
 * `active_power` W or kW, and a wrong unit is worse than none.
 *
 * Symbols only: whether a space belongs between value and unit depends on the
 * surface (a chart tick cannot hold one — see `FloatPanel`), so spacing is the
 * caller's decision.
 */

/**
 * Attribute names that carry a temperature, as a snake_case token match:
 * `temperature`, `temperature_setpoint`, `outlet_temperature`,
 * `supply_air_temperature_setpoint`. A name that merely contains the letters
 * (`temperature_sensor_id`) still matches the token and is accepted — the
 * catalog has no such name, and the alternative is enumerating every
 * driver-defined variant.
 */
const TEMPERATURE_ATTRIBUTE = /(^|_)temperature(_|$)/;

/** Attributes whose unit is known exactly, by name. */
const EXACT_UNITS: Record<string, string> = {
  humidity: "%",
};

/**
 * Unit symbol for an attribute: the one its driver declares when there is
 * one, else the name convention above, else null when unknowable.
 */
export function attributeUnit(
  attributeName: string,
  attribute?: { unit?: string | null } | null,
): string | null {
  if (attribute?.unit) return attribute.unit;
  if (TEMPERATURE_ATTRIBUTE.test(attributeName)) return "°";
  return EXACT_UNITS[attributeName] ?? null;
}
