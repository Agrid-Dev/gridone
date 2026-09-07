/** Camel-cased view of the `pump` standard attribute schema
 *  (packages/devices_manager .../standard_schemas/registry/pump.py).
 *
 *  Every field but `onoffState` is optional on the wire, and the components
 *  render what is present: the same view serves a 41-point smart pump and a
 *  circulator wired to a single run contact.
 *
 *  No fault field: alarms are not part of the type contract, and the generic
 *  fault UI reads them straight off the device. */
export type PumpValues = {
  onoffState?: boolean | null;
  head?: number | null;
  volumeFlow?: number | null;
  speed?: number | null;
  operatingHours?: number | null;
  controlMode?: string | null;
  setpoint?: number | null;
  actualSetpoint?: number | null;
  power?: number | null;
  energy?: number | null;
  motorCurrent?: number | null;
  liquidTemperature?: number | null;
  starts?: number | null;
  motorVoltage?: number | null;
};

/** Wire names of the pump readings that have a `pump.field.*` label. A literal
 *  union rather than `string`, so `t(`pump.field.${key}`)` resolves against the
 *  typed locale resources instead of widening to any key. */
export type PumpFieldKey =
  | "head"
  | "volume_flow"
  | "speed"
  | "power"
  | "energy"
  | "operating_hours"
  | "motor_current"
  | "motor_voltage"
  | "setpoint"
  | "actual_setpoint"
  | "liquid_temperature"
  | "starts"
  | "control_mode";
