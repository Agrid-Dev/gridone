import snakecaseKeys from "snakecase-keys";
import { request } from "./request";

export type DeviceAttribute = {
  name: string;
  dataType: "int" | "float" | "bool" | "string" | string;
  readWriteModes: Array<"read" | "write" | string>;
  currentValue: string | number | boolean | null;
  lastUpdated: string | null;
};

export enum DeviceType {
  Thermostat = "thermostat",
  Awhp = "awhp",
}

export type Device = {
  id: string;
  name: string;
  type: DeviceType | null;
  driverId: string;
  transportId: string;
  config: Record<string, unknown>;
  attributes: Record<string, DeviceAttribute>;
};

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

/** A Device whose `type` is `"thermostat"`. */
export type ThermostatDevice = Device & { type: DeviceType.Thermostat };

/** A Device whose `type` is `"awhp"`. */
export type AwhpDevice = Device & { type: DeviceType.Awhp };

/** Union of all devices with a known standard type. */
export type StandardDevice = ThermostatDevice | AwhpDevice;

// Type guards ---

export function isThermostat(device: Device): device is ThermostatDevice {
  return device.type === DeviceType.Thermostat;
}

export function isAwhp(device: Device): device is AwhpDevice {
  return device.type === DeviceType.Awhp;
}

export function isStandardDevice(device: Device): device is StandardDevice {
  return isThermostat(device) || isAwhp(device);
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

export type DeviceCreatePayload = {
  name: string;
  driverId: string;
  transportId: string;
  config: Record<string, unknown>;
};

export function listDevices(
  params?: Record<string, string>,
): Promise<Device[]> {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  return request<Device[]>(`/devices/${query}`, undefined, { camelCase: true });
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
  await request<Device>(
    `/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(snakecaseAttribute)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  return getDevice(deviceId);
}

export async function deleteDevice(deviceId: string): Promise<void> {
  return request<void>(`/devices/${deviceId}`, {
    method: "DELETE",
  });
}
