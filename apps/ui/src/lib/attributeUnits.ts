/**
 * Display unit for a device attribute, derived from its name.
 *
 * Devices do not declare units on the wire, so the app only claims the ones
 * its own conventions already assume (see `formatValue.ts`): a scale-agnostic
 * `°` for temperatures, `%` for ratios, `W` for electrical power. Anything
 * else stays unitless rather than guessing — a driver-defined `pressure`
 * could be bar, Pa or PSI, and a wrong unit is worse than none.
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
  active_power: "W",
};

/** Unit symbol for `attributeName`, or null when the unit is unknowable. */
export function attributeUnit(attributeName: string): string | null {
  if (TEMPERATURE_ATTRIBUTE.test(attributeName)) return "°";
  return EXACT_UNITS[attributeName] ?? null;
}

/**
 * The unit shared by every one of `attributeNames`, or null when they
 * disagree or any of them is unitless.
 *
 * What a common axis can be labelled with: temperature plotted against its
 * setpoint is degrees throughout, but temperature plotted against humidity
 * has no single unit and must stay bare.
 */
export function commonAttributeUnit(
  attributeNames: readonly string[],
): string | null {
  if (attributeNames.length === 0) return null;
  const [first, ...rest] = attributeNames.map(attributeUnit);
  return first != null && rest.every((unit) => unit === first) ? first : null;
}
