/**
 * The thermocktat emulators' http side-channel.
 *
 * Every emulator publishes its http controller on a host port (`908x`, see
 * ../compose.override.yaml) so suites can change device state behind gridone's
 * back and assert that polling or listening catches it. gridone itself reaches
 * the emulators on the compose network and never through these ports.
 */

/** Values the emulator's write endpoints accept. */
export type ThermocktatValue = number | string | boolean;

/**
 * Writable emulator fields.
 *
 * This is the emulator's vocabulary, not gridone's: `enabled` is the field
 * behind the `onoff_state` attribute, and `fault_code` is the raw int the
 * driver maps to a label. The others match the write paths in
 * fixtures/thermocktat-http-driver.yaml.
 */
export type ThermocktatField =
  | "temperature_setpoint"
  | "temperature_setpoint_min"
  | "temperature_setpoint_max"
  | "enabled"
  | "mode"
  | "fan_speed"
  | "fault_code";

/**
 * Sets one field on the emulator serving at `baseUrl`.
 *
 * Throws on any non-2xx: an unknown field answers 404, so a typo fails the
 * test that made it instead of silently doing nothing. Teardown that must not
 * mask an earlier failure can still `.catch(() => undefined)`.
 */
export async function writeThermocktat(
  baseUrl: string,
  field: ThermocktatField,
  value: ThermocktatValue,
): Promise<void> {
  const url = `${baseUrl}/v1/${field}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) {
    throw new Error(
      `POST ${url} with value ${JSON.stringify(value)} failed: ` +
        `${response.status} ${response.statusText}`,
    );
  }
}
