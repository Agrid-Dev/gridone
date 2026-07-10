/**
 * Device domain helpers over the SDK wire types.
 *
 * Attribute maps and payloads keep the wire format (snake_case keys, exactly
 * what `@gridone/sdk` returns); the typed *views* built here (e.g.
 * `ThermostatAttributes`) are UI-side objects and use idiomatic camelCase.
 */
import type {
  ConnectionStatus as ConnectionStatusValue,
  Device,
  DeviceListParams,
  DevicesFilterBody,
} from "@gridone/sdk";

/** Value type of one entry in `Device.attributes`. */
export type DeviceAttribute = NonNullable<Device["attributes"]>[string];

export type AttributeValue = string | number | boolean;

export enum DeviceType {
  Thermostat = "thermostat",
  Awhp = "awhp",
  WeatherSensor = "weather_sensor",
  ElectricityMeter = "electricity_meter",
  AhuDoubleFlux = "ahu_double_flux",
  AhuSingleFlux = "ahu_single_flux",
  AirExtractor = "air_extractor",
}

/** A device's attribute map (`attributes` is optional on the wire). */
export function deviceAttributes(
  device: Device,
): Record<string, DeviceAttribute> {
  return device.attributes ?? {};
}

/** The read/write modes a device supports, as the union of its attributes'
 *  modes (e.g. a device with one writable attribute supports "write"). */
export function getDeviceReadWriteModes(device: Device): Set<string> {
  const modes = new Set<string>();
  for (const attr of Object.values(deviceAttributes(device))) {
    const attrModes = attr.read_write_modes;
    if (!Array.isArray(attrModes)) continue;
    for (const mode of attrModes) {
      if (typeof mode === "string") modes.add(mode);
    }
  }
  return modes;
}

/** A device is read-only when none of its attributes support writing
 *  (e.g. a weather sensor) — no commands can be issued to it. */
export function isReadOnlyDevice(device: Device): boolean {
  return !getDeviceReadWriteModes(device).has("write");
}

/** Whether a single attribute (by wire name) supports writing. */
export function isAttributeWritable(device: Device, name: string): boolean {
  const attrModes = deviceAttributes(device)[name]?.read_write_modes;
  return Array.isArray(attrModes) && attrModes.includes("write");
}

// ---------------------------------------------------------------------------
// Standard device type helpers
// ---------------------------------------------------------------------------

/** Extract a typed attribute value, returning `null` when the attribute is missing. */
type AttrValue<T> = T | null;

/** Typed view of thermostat standard attributes (read from Device.attributes). */
export type ThermostatAttributes = {
  temperature: AttrValue<number>;
  temperatureSetpoint: AttrValue<number>;
  onoffState: AttrValue<boolean>;
  mode: AttrValue<string>;
  fanSpeed: AttrValue<string>;
  temperatureSetpointMin: AttrValue<number>;
  temperatureSetpointMax: AttrValue<number>;
};

/** Typed view of AWHP standard attributes (read from Device.attributes). */
export type AwhpAttributes = {
  onoffState: AttrValue<boolean>;
  unitRunStatus: AttrValue<string>;
  mode: AttrValue<string>;
  inletTemperature: AttrValue<number>;
  outletTemperature: AttrValue<number>;
  setpointTemperature: AttrValue<number>;
  outdoorTemperature: AttrValue<number>;
  compressorSuctionTemperature: AttrValue<number>;
  compressorSuctionPressure: AttrValue<number>;
  compressorDischargeTemperature: AttrValue<number>;
  compressorDischargePressure: AttrValue<number>;
  condenserSaturatedRefrigerantTemperature: AttrValue<number>;
  condenserRefrigerantPressure: AttrValue<number>;
  evaporatorSaturatedRefrigerantTemperature: AttrValue<number>;
  evaporatorRefrigerantPressure: AttrValue<number>;
};

/** Typed view of weather sensor standard attributes. */
export type WeatherSensorAttributes = {
  temperature: AttrValue<number>;
  weatherCode: AttrValue<number>;
  windSpeed: AttrValue<number>;
  windDirection: AttrValue<number>;
  humidity: AttrValue<number>;
};

/** Typed view of electricity meter standard attributes. */
export type ElectricityMeterAttributes = {
  energy: AttrValue<number>;
  activePower: AttrValue<number>;
  reactivePower: AttrValue<number>;
  index: AttrValue<number>;
};

/** Typed view of the `ahu_double_flux` standard attributes. */
export type AhuDoubleFluxAttributes = {
  supplyAirTemperature: AttrValue<number>;
  supplyAirTemperatureSetpoint: AttrValue<number>;
  supplyFanSpeed: AttrValue<number>;
  extractAirTemperature: AttrValue<number>;
  extractFanSpeed: AttrValue<number>;
  onoffState: AttrValue<boolean>;
  hvacMode: AttrValue<string>;
  supplyAirPressure: AttrValue<number>;
  supplyAirPressureSetpoint: AttrValue<number>;
  extractAirPressure: AttrValue<number>;
  extractAirPressureSetpoint: AttrValue<number>;
  outdoorAirTemperature: AttrValue<number>;
  exhaustAirTemperature: AttrValue<number>;
  heatingValve: AttrValue<number>;
  coolingValve: AttrValue<number>;
  exchangerUtilization: AttrValue<number>;
};

/** Typed view of the `ahu_single_flux` standard attributes. */
export type AhuSingleFluxAttributes = {
  supplyAirTemperature: AttrValue<number>;
  supplyAirTemperatureSetpoint: AttrValue<number>;
  supplyFanSpeed: AttrValue<number>;
  onoffState: AttrValue<boolean>;
  hvacMode: AttrValue<string>;
  supplyAirPressure: AttrValue<number>;
  supplyAirPressureSetpoint: AttrValue<number>;
  outdoorAirTemperature: AttrValue<number>;
  extractAirTemperature: AttrValue<number>;
  extractAirPressure: AttrValue<number>;
  extractFanSpeed: AttrValue<number>;
  heatingValve: AttrValue<number>;
  coolingValve: AttrValue<number>;
};

/** Typed view of the `air_extractor` standard attributes. */
export type AirExtractorAttributes = {
  onoffState: AttrValue<boolean>;
  fanSpeed: AttrValue<number>;
  /** Flow (differential-pressure) switch: `true` when airflow is proven. */
  flowSwitch: AttrValue<boolean>;
};

/** A Device whose `type` is `"thermostat"`. */
export type ThermostatDevice = Device & { type: DeviceType.Thermostat };

/** A Device whose `type` is `"awhp"`. */
export type AwhpDevice = Device & { type: DeviceType.Awhp };

/** A Device whose `type` is `"weather_sensor"`. */
export type WeatherSensorDevice = Device & {
  type: DeviceType.WeatherSensor;
};

/** A Device whose `type` is `"electricity_meter"`. */
export type ElectricityMeterDevice = Device & {
  type: DeviceType.ElectricityMeter;
};

/** A Device whose `type` is `"ahu_double_flux"`. */
export type AhuDoubleFluxDevice = Device & {
  type: DeviceType.AhuDoubleFlux;
};

/** A Device whose `type` is `"ahu_single_flux"`. */
export type AhuSingleFluxDevice = Device & {
  type: DeviceType.AhuSingleFlux;
};

/** A Device whose `type` is `"air_extractor"`. */
export type AirExtractorDevice = Device & {
  type: DeviceType.AirExtractor;
};

/** Union of all devices with a known standard type. */
export type StandardDevice =
  | ThermostatDevice
  | AwhpDevice
  | WeatherSensorDevice
  | ElectricityMeterDevice
  | AhuDoubleFluxDevice
  | AhuSingleFluxDevice
  | AirExtractorDevice;

// Type guards ---

export function isThermostat(device: Device): device is ThermostatDevice {
  return device.type === DeviceType.Thermostat;
}

export function isAwhp(device: Device): device is AwhpDevice {
  return device.type === DeviceType.Awhp;
}

export function isWeatherSensor(device: Device): device is WeatherSensorDevice {
  return device.type === DeviceType.WeatherSensor;
}

export function isElectricityMeter(
  device: Device,
): device is ElectricityMeterDevice {
  return device.type === DeviceType.ElectricityMeter;
}

export function isAhuDoubleFlux(device: Device): device is AhuDoubleFluxDevice {
  return device.type === DeviceType.AhuDoubleFlux;
}

export function isAhuSingleFlux(device: Device): device is AhuSingleFluxDevice {
  return device.type === DeviceType.AhuSingleFlux;
}

export function isAirExtractor(device: Device): device is AirExtractorDevice {
  return device.type === DeviceType.AirExtractor;
}

export function isStandardDevice(device: Device): device is StandardDevice {
  return (
    isThermostat(device) ||
    isAwhp(device) ||
    isWeatherSensor(device) ||
    isElectricityMeter(device) ||
    isAhuDoubleFlux(device) ||
    isAhuSingleFlux(device) ||
    isAirExtractor(device)
  );
}

/** Enum-style accessors over the SDK's `ConnectionStatus` union. */
export const ConnectionStatus = {
  Idle: "idle",
  Ok: "ok",
  Degraded: "degraded",
  Error: "error",
} as const satisfies Record<string, ConnectionStatusValue>;
// eslint-disable-next-line no-redeclare -- intentional const + type merge
export type ConnectionStatus = ConnectionStatusValue;

export function getConnectionStatus(device: Device): ConnectionStatus | null {
  const val = deviceAttributes(device)["connection_status"]?.current_value;
  if (
    val !== ConnectionStatus.Idle &&
    val !== ConnectionStatus.Ok &&
    val !== ConnectionStatus.Degraded &&
    val !== ConnectionStatus.Error
  )
    return null;
  return val;
}

/** Read the standard thermostat attributes from a device's attribute map. */
export function readThermostatAttributes(
  device: ThermostatDevice,
): ThermostatAttributes {
  const v = attributeValueReader(device);
  return {
    temperature: v("temperature") as AttrValue<number>,
    temperatureSetpoint: v("temperature_setpoint") as AttrValue<number>,
    onoffState: v("onoff_state") as AttrValue<boolean>,
    mode: v("mode") as AttrValue<string>,
    fanSpeed: v("fan_speed") as AttrValue<string>,
    temperatureSetpointMin: v("temperature_setpoint_min") as AttrValue<number>,
    temperatureSetpointMax: v("temperature_setpoint_max") as AttrValue<number>,
  };
}

/** Read the standard AWHP attributes from a device's attribute map. */
export function readAwhpAttributes(device: AwhpDevice): AwhpAttributes {
  const v = attributeValueReader(device);
  return {
    onoffState: v("onoff_state") as AttrValue<boolean>,
    unitRunStatus: v("unit_run_status") as AttrValue<string>,
    mode: v("mode") as AttrValue<string>,
    inletTemperature: v("inlet_temperature") as AttrValue<number>,
    outletTemperature: v("outlet_temperature") as AttrValue<number>,
    setpointTemperature: v("setpoint_temperature") as AttrValue<number>,
    outdoorTemperature: v("outdoor_temperature") as AttrValue<number>,
    compressorSuctionTemperature: v(
      "compressor_suction_temperature",
    ) as AttrValue<number>,
    compressorSuctionPressure: v(
      "compressor_suction_pressure",
    ) as AttrValue<number>,
    compressorDischargeTemperature: v(
      "compressor_discharge_temperature",
    ) as AttrValue<number>,
    compressorDischargePressure: v(
      "compressor_discharge_pressure",
    ) as AttrValue<number>,
    condenserSaturatedRefrigerantTemperature: v(
      "condenser_saturated_refrigerant_temperature",
    ) as AttrValue<number>,
    condenserRefrigerantPressure: v(
      "condenser_refrigerant_pressure",
    ) as AttrValue<number>,
    evaporatorSaturatedRefrigerantTemperature: v(
      "evaporator_saturated_refrigerant_temperature",
    ) as AttrValue<number>,
    evaporatorRefrigerantPressure: v(
      "evaporator_refrigerant_pressure",
    ) as AttrValue<number>,
  };
}

/** Read the standard weather sensor attributes from a device's attribute map. */
export function readWeatherSensorAttributes(
  device: WeatherSensorDevice,
): WeatherSensorAttributes {
  const v = attributeValueReader(device);
  return {
    temperature: v("temperature") as AttrValue<number>,
    weatherCode: v("weather_code") as AttrValue<number>,
    windSpeed: v("wind_speed") as AttrValue<number>,
    windDirection: v("wind_direction") as AttrValue<number>,
    humidity: v("humidity") as AttrValue<number>,
  };
}

/** Read the standard electricity meter attributes from a device's attribute map. */
export function readElectricityMeterAttributes(
  device: ElectricityMeterDevice,
): ElectricityMeterAttributes {
  const v = attributeValueReader(device);
  return {
    energy: v("energy") as AttrValue<number>,
    activePower: v("active_power") as AttrValue<number>,
    reactivePower: v("reactive_power") as AttrValue<number>,
    index: v("index") as AttrValue<number>,
  };
}

/** Read the standard double-flux AHU attributes from a device's attribute map. */
export function readAhuDoubleFluxAttributes(
  device: AhuDoubleFluxDevice,
): AhuDoubleFluxAttributes {
  const v = attributeValueReader(device);
  return {
    supplyAirTemperature: v("supply_air_temperature") as AttrValue<number>,
    supplyAirTemperatureSetpoint: v(
      "supply_air_temperature_setpoint",
    ) as AttrValue<number>,
    supplyFanSpeed: v("supply_fan_speed") as AttrValue<number>,
    extractAirTemperature: v("extract_air_temperature") as AttrValue<number>,
    extractFanSpeed: v("extract_fan_speed") as AttrValue<number>,
    onoffState: v("onoff_state") as AttrValue<boolean>,
    hvacMode: v("hvac_mode") as AttrValue<string>,
    supplyAirPressure: v("supply_air_pressure") as AttrValue<number>,
    supplyAirPressureSetpoint: v(
      "supply_air_pressure_setpoint",
    ) as AttrValue<number>,
    extractAirPressure: v("extract_air_pressure") as AttrValue<number>,
    extractAirPressureSetpoint: v(
      "extract_air_pressure_setpoint",
    ) as AttrValue<number>,
    outdoorAirTemperature: v("outdoor_air_temperature") as AttrValue<number>,
    exhaustAirTemperature: v("exhaust_air_temperature") as AttrValue<number>,
    heatingValve: v("heating_valve") as AttrValue<number>,
    coolingValve: v("cooling_valve") as AttrValue<number>,
    exchangerUtilization: v("exchanger_utilization") as AttrValue<number>,
  };
}

/** Read the standard single-flux AHU attributes from a device's attribute map. */
export function readAhuSingleFluxAttributes(
  device: AhuSingleFluxDevice,
): AhuSingleFluxAttributes {
  const v = attributeValueReader(device);
  return {
    supplyAirTemperature: v("supply_air_temperature") as AttrValue<number>,
    supplyAirTemperatureSetpoint: v(
      "supply_air_temperature_setpoint",
    ) as AttrValue<number>,
    supplyFanSpeed: v("supply_fan_speed") as AttrValue<number>,
    onoffState: v("onoff_state") as AttrValue<boolean>,
    hvacMode: v("hvac_mode") as AttrValue<string>,
    supplyAirPressure: v("supply_air_pressure") as AttrValue<number>,
    supplyAirPressureSetpoint: v(
      "supply_air_pressure_setpoint",
    ) as AttrValue<number>,
    outdoorAirTemperature: v("outdoor_air_temperature") as AttrValue<number>,
    extractAirTemperature: v("extract_air_temperature") as AttrValue<number>,
    extractAirPressure: v("extract_air_pressure") as AttrValue<number>,
    extractFanSpeed: v("extract_fan_speed") as AttrValue<number>,
    heatingValve: v("heating_valve") as AttrValue<number>,
    coolingValve: v("cooling_valve") as AttrValue<number>,
  };
}

/** Read the standard air extractor attributes from a device's attribute map. */
export function readAirExtractorAttributes(
  device: AirExtractorDevice,
): AirExtractorAttributes {
  const v = attributeValueReader(device);
  return {
    onoffState: v("onoff_state") as AttrValue<boolean>,
    fanSpeed: v("fan_speed") as AttrValue<number>,
    flowSwitch: v("flow_switch") as AttrValue<boolean>,
  };
}

function attributeValueReader(device: Device) {
  const attributes = deviceAttributes(device);
  return (name: string) => attributes[name]?.current_value ?? null;
}

// ---------------------------------------------------------------------------
// Device filters
// ---------------------------------------------------------------------------

/** Shape of a filter over devices, shared between ``GET /devices`` and the
 *  ``target`` field on batch-command dispatches. Wire-format keys — a
 *  superset of the SDK's ``DevicesFilterBody`` with the list-only params.
 *  Intersection semantics across fields. */
export type DevicesFilter = DevicesFilterBody & {
  /** Free-text fuzzy match against the device ``name``. */
  search?: string;
  /** Restrict to devices bound to this driver. */
  driver_id?: string;
  /** Restrict to devices bound to this transport. */
  transport_id?: string;
};

/** Map a DevicesFilter onto ``GET /devices`` query params.
 *
 *  Field mapping:
 *   - ``types`` becomes the repeated ``type`` param
 *   - ``tags`` expands to ``tags=key:value`` pairs
 *   - ``writable_attribute*`` fields only apply to batch-command targets and
 *     are not sent (the list endpoint does not support them)
 */
export function devicesFilterToListParams(
  filter: DevicesFilter | undefined,
): DeviceListParams {
  if (!filter) return {};
  const tags = Object.entries(filter.tags ?? {}).flatMap(([key, values]) =>
    values.map((value) => `${key}:${value}`),
  );
  return {
    ids: filter.ids ?? undefined,
    type: filter.types ?? undefined,
    tags: tags.length ? tags : undefined,
    is_faulty: filter.is_faulty ?? undefined,
    asset_id: filter.asset_id ?? undefined,
    search: filter.search,
    driver_id: filter.driver_id,
    transport_id: filter.transport_id,
  };
}
