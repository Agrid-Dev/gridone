import { DeviceType } from "@/lib/devices";

/** Both air handlers lead with their supply air and run on the same evidence. */
const AHU = [
  "supply_air_temperature",
  "supply_air_temperature_setpoint",
  "onoff_state",
  "hvac_mode",
  "heating_valve",
  "cooling_valve",
];

/** Every attribute a standard type's fleet card reads: its `fleetStatus`, its
 *  `fleetLead` and its primary measure (see registry). Kept apart from the
 *  registry, which pulls in every control, so the shell can import it. */
export const FLEET_ATTRIBUTES_BY_TYPE: Readonly<
  Partial<Record<DeviceType, readonly string[]>>
> = {
  [DeviceType.Thermostat]: [
    "temperature",
    "temperature_setpoint",
    "onoff_state",
    "mode",
  ],
  [DeviceType.Awhp]: [
    "outlet_temperature",
    "setpoint_temperature",
    "onoff_state",
    "mode",
  ],
  [DeviceType.WeatherSensor]: ["temperature", "weather_code"],
  [DeviceType.ElectricityMeter]: ["active_power", "energy", "index"],
  [DeviceType.AhuDoubleFlux]: AHU,
  [DeviceType.AhuSingleFlux]: AHU,
  [DeviceType.AirExtractor]: ["fan_speed", "onoff_state", "flow_switch"],
  [DeviceType.PmsMonitor]: [
    "reservation_status",
    "guest_count",
    "next_arrival_at",
  ],
  [DeviceType.LiquidDetector]: ["liquid_detected"],
  [DeviceType.Pump]: ["onoff_state"],
};

/** The attributes a fleet list fetches of each device: what any standard
 *  type's card reads, plus the connection status. Faults come by kind, since
 *  drivers name them (see useDeviceFleet). */
export const FLEET_ATTRIBUTES: readonly string[] = [
  ...new Set([
    "connection_status",
    ...Object.values(FLEET_ATTRIBUTES_BY_TYPE).flat(),
  ]),
].sort();

/** The second key segment of fleet lists: they live under `["devices"]`, so
 *  every invalidation of the device lists refreshes them too, but hold
 *  partial devices, which `findDeviceInCachedLists` must skip. */
export const FLEET_KEY = "fleet";
