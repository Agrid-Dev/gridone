import snakecaseKeys from "snakecase-keys";
import { request } from "./request";

export type AttributeKind = "standard" | "fault" | "internal";
export type AttributeValue = string | number | boolean;

import type { Severity } from "./severity";
export type { Severity };

export type DeviceAttribute = {
  kind: AttributeKind;
  name: string;
  dataType: "int" | "float" | "bool" | "str" | string;
  readWriteModes: Array<"read" | "write" | string>;
  currentValue: AttributeValue | null;
  lastUpdated: string | null;
  lastChanged: string | null;
  valueOptions?: AttributeValue[];
};

export type FaultAttribute = DeviceAttribute & {
  kind: "fault";
  severity: Severity;
  isFaulty: boolean;
};

export enum DeviceType {
  Thermostat = "thermostat",
  Awhp = "awhp",
  WeatherSensor = "weather_sensor",
  ElectricityMeter = "electricity_meter",
  AhuDoubleFlux = "ahu_double_flux",
}

export enum DeviceKind {
  Physical = "physical",
  Virtual = "virtual",
}

type DeviceCommon = {
  id: string;
  name: string;
  type: DeviceType | null;
  tags: Record<string, string>;
  attributes: Record<string, DeviceAttribute>;
  isFaulty: boolean;
};

export type PhysicalDevice = DeviceCommon & {
  kind: DeviceKind.Physical;
  driverId: string;
  transportId: string;
  config: Record<string, unknown>;
};

export type VirtualDevice = DeviceCommon & {
  kind: DeviceKind.Virtual;
};

/** Discriminated by `kind`; mirrors the backend `DeviceKind` split. */
export type Device = PhysicalDevice | VirtualDevice;

export function isPhysicalDevice(device: Device): device is PhysicalDevice {
  return device.kind === DeviceKind.Physical;
}

export function isVirtualDevice(device: Device): device is VirtualDevice {
  return device.kind === DeviceKind.Virtual;
}

/** The read/write modes a device supports, as the union of its attributes'
 *  modes (e.g. a device with one writable attribute supports "write"). */
export function getDeviceReadWriteModes(device: Device): Set<string> {
  const modes = new Set<string>();
  for (const attr of Object.values(device.attributes)) {
    for (const mode of attr.readWriteModes) modes.add(mode);
  }
  return modes;
}

/** A device is read-only when none of its attributes support writing
 *  (e.g. a weather sensor) — no commands can be issued to it. */
export function isReadOnlyDevice(device: Device): boolean {
  return !getDeviceReadWriteModes(device).has("write");
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

/** Union of all devices with a known standard type. */
export type StandardDevice =
  | ThermostatDevice
  | AwhpDevice
  | WeatherSensorDevice
  | ElectricityMeterDevice;

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

export function isStandardDevice(device: Device): device is StandardDevice {
  return (
    isThermostat(device) ||
    isAwhp(device) ||
    isWeatherSensor(device) ||
    isElectricityMeter(device)
  );
}

export enum ConnectionStatus {
  Idle = "idle",
  Ok = "ok",
  Degraded = "degraded",
  Error = "error",
}

export function getConnectionStatus(device: Device): ConnectionStatus | null {
  const val = device.attributes["connectionStatus"]?.currentValue;
  if (
    val !== ConnectionStatus.Idle &&
    val !== ConnectionStatus.Ok &&
    val !== ConnectionStatus.Degraded &&
    val !== ConnectionStatus.Error
  )
    return null;
  return val as ConnectionStatus;
}

/**
 * Read the standard thermostat attributes from a device's attribute map.
 * Attribute keys are already camelCase (converted by the API client).
 */
export function readThermostatAttributes(
  device: ThermostatDevice,
): ThermostatAttributes {
  const v = (name: string) => device.attributes[name]?.currentValue ?? null;
  return {
    temperature: v("temperature") as AttrValue<number>,
    temperatureSetpoint: v("temperatureSetpoint") as AttrValue<number>,
    onoffState: v("onoffState") as AttrValue<boolean>,
    mode: v("mode") as AttrValue<string>,
    fanSpeed: v("fanSpeed") as AttrValue<string>,
    temperatureSetpointMin: v("temperatureSetpointMin") as AttrValue<number>,
    temperatureSetpointMax: v("temperatureSetpointMax") as AttrValue<number>,
  };
}

/**
 * Read the standard AWHP attributes from a device's attribute map.
 * Attribute keys are already camelCase (converted by the API client).
 */
export function readAwhpAttributes(device: AwhpDevice): AwhpAttributes {
  const v = (name: string) => device.attributes[name]?.currentValue ?? null;
  return {
    onoffState: v("onoffState") as AttrValue<boolean>,
    unitRunStatus: v("unitRunStatus") as AttrValue<string>,
    mode: v("mode") as AttrValue<string>,
    inletTemperature: v("inletTemperature") as AttrValue<number>,
    outletTemperature: v("outletTemperature") as AttrValue<number>,
    setpointTemperature: v("setpointTemperature") as AttrValue<number>,
    outdoorTemperature: v("outdoorTemperature") as AttrValue<number>,
    compressorSuctionTemperature: v(
      "compressorSuctionTemperature",
    ) as AttrValue<number>,
    compressorSuctionPressure: v(
      "compressorSuctionPressure",
    ) as AttrValue<number>,
    compressorDischargeTemperature: v(
      "compressorDischargeTemperature",
    ) as AttrValue<number>,
    compressorDischargePressure: v(
      "compressorDischargePressure",
    ) as AttrValue<number>,
    condenserSaturatedRefrigerantTemperature: v(
      "condenserSaturatedRefrigerantTemperature",
    ) as AttrValue<number>,
    condenserRefrigerantPressure: v(
      "condenserRefrigerantPressure",
    ) as AttrValue<number>,
    evaporatorSaturatedRefrigerantTemperature: v(
      "evaporatorSaturatedRefrigerantTemperature",
    ) as AttrValue<number>,
    evaporatorRefrigerantPressure: v(
      "evaporatorRefrigerantPressure",
    ) as AttrValue<number>,
  };
}

/**
 * Read the standard weather sensor attributes from a device's attribute map.
 * Attribute keys are already camelCase (converted by the API client).
 */
export function readWeatherSensorAttributes(
  device: WeatherSensorDevice,
): WeatherSensorAttributes {
  const v = (name: string) => device.attributes[name]?.currentValue ?? null;
  return {
    temperature: v("temperature") as AttrValue<number>,
    weatherCode: v("weatherCode") as AttrValue<number>,
    windSpeed: v("windSpeed") as AttrValue<number>,
    windDirection: v("windDirection") as AttrValue<number>,
    humidity: v("humidity") as AttrValue<number>,
  };
}

/**
 * Read the standard electricity meter attributes from a device's attribute map.
 * Attribute keys are already camelCase (converted by the API client).
 */
export function readElectricityMeterAttributes(
  device: ElectricityMeterDevice,
): ElectricityMeterAttributes {
  const v = (name: string) => device.attributes[name]?.currentValue ?? null;
  return {
    energy: v("energy") as AttrValue<number>,
    activePower: v("activePower") as AttrValue<number>,
    reactivePower: v("reactivePower") as AttrValue<number>,
    index: v("index") as AttrValue<number>,
  };
}

export type DeviceCreatePayload = {
  name: string;
  driverId: string;
  transportId: string;
  config: Record<string, unknown>;
};

/** Shape of a filter over devices, shared between ``GET /devices`` and the
 *  ``target`` field on batch-command dispatches. Mirrors the backend
 *  ``DM.list_devices`` kwargs. Intersection semantics across fields. */
export type DevicesFilter = {
  ids?: string[];
  types?: string[];
  tags?: Record<string, string[]>;
  isFaulty?: boolean;
  writableAttribute?: string;
  writableAttributeType?: "int" | "float" | "str" | "bool";
  /** Convenience alias: backend translates into the ``asset_id`` tag before
   *  calling ``DM.list_devices``. Persisted verbatim on saved command
   *  templates so the UI can round-trip intent. */
  assetId?: string;
  /** Free-text fuzzy match against the device ``name``. */
  search?: string;
  /** Restrict to devices bound to this driver (physical devices only). */
  driverId?: string;
  /** Restrict to devices bound to this transport (physical devices only). */
  transportId?: string;
};

/** Serialise a DevicesFilter into query params for ``GET /devices``.
 *
 *  Field mapping:
 *   - ``ids`` / ``types`` become repeated ``ids=`` / ``type=`` params
 *   - ``tags`` expands to ``tags=key:value`` pairs
 *   - scalar fields map to their snake_case equivalents
 */
export function devicesFilterToQueryParams(
  filter: DevicesFilter | undefined,
): URLSearchParams {
  const params = new URLSearchParams();
  if (!filter) return params;
  for (const id of filter.ids ?? []) params.append("ids", id);
  for (const t of filter.types ?? []) params.append("type", t);
  if (filter.tags) {
    for (const [key, values] of Object.entries(filter.tags)) {
      for (const value of values) params.append("tags", `${key}:${value}`);
    }
  }
  if (filter.isFaulty !== undefined) {
    params.set("is_faulty", String(filter.isFaulty));
  }
  if (filter.writableAttribute) {
    params.set("writable_attribute", filter.writableAttribute);
  }
  if (filter.writableAttributeType) {
    params.set("writable_attribute_type", filter.writableAttributeType);
  }
  if (filter.assetId) {
    params.set("asset_id", filter.assetId);
  }
  if (filter.search) {
    params.set("search", filter.search);
  }
  if (filter.driverId) {
    params.set("driver_id", filter.driverId);
  }
  if (filter.transportId) {
    params.set("transport_id", filter.transportId);
  }
  return params;
}

export function listDevices(filter?: DevicesFilter): Promise<Device[]> {
  const qs = devicesFilterToQueryParams(filter).toString();
  return request<Device[]>(`/devices/${qs ? `?${qs}` : ""}`, undefined, {
    camelCase: true,
  });
}

export function getDevice(deviceId: string): Promise<Device> {
  return request<Device>(
    `/devices/${encodeURIComponent(deviceId)}`,
    undefined,
    { camelCase: true },
  );
}

export function createDevice(payload: DeviceCreatePayload): Promise<Device> {
  return request<Device>(
    "/devices/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snakecaseKeys(payload, { deep: true })),
    },
    { camelCase: true },
  );
}

export function updateDevice(
  deviceId: string,
  payload: Partial<Device>,
): Promise<Device> {
  return request<Device>(
    `/devices/${deviceId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snakecaseKeys(payload, { deep: true })),
    },
    { camelCase: true },
  );
}

export function setDeviceTag(
  deviceId: string,
  key: string,
  value: string,
): Promise<Device> {
  return request<Device>(
    `/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
    { camelCase: true },
  );
}

export function deleteDeviceTag(deviceId: string, key: string): Promise<void> {
  return request<void>(
    `/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}

export function linkDeviceToAsset(
  deviceId: string,
  assetId: string,
): Promise<Device> {
  return setDeviceTag(deviceId, "asset_id", assetId);
}

export function unlinkDeviceFromAsset(deviceId: string): Promise<void> {
  return deleteDeviceTag(deviceId, "asset_id");
}

export async function updateDeviceAttribute(
  deviceId: string,
  attributeName: string,
  value: string | number | boolean | null,
): Promise<Device> {
  const snakecaseAttribute = Object.keys(
    snakecaseKeys({
      [attributeName]: value,
    }),
  )[0];
  // The server exposes attribute writes as a Command. We dispatch a single
  // synchronous command and refetch the device — the caller still sees the
  // (deviceId, attributeName, value) → Device contract it had before.
  await request(`/devices/${encodeURIComponent(deviceId)}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attribute: snakecaseAttribute, value }),
  });
  return getDevice(deviceId);
}

export async function deleteDevice(deviceId: string): Promise<void> {
  return request<void>(`/devices/${deviceId}`, {
    method: "DELETE",
  });
}
