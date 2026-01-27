import { request } from "./request";

export type DeviceAttribute = {
  name: string;
  dataType: "int" | "float" | "bool" | "string" | string;
  readWriteModes: Array<"read" | "write" | string>;
  currentValue: string | number | boolean | null;
  lastUpdated: string | null;
};

export type Device = {
  id: string;
  driverId: string;
  transportId: string;
  config: Record<string, unknown>;
  attributes: Record<string, DeviceAttribute>;
};

export function listDevices(): Promise<Device[]> {
  return request<Device[]>("/devices/", undefined, { camelCase: true });
}

export function getDevice(deviceId: string): Promise<Device> {
  return request<Device>(
    `/devices/${encodeURIComponent(deviceId)}`,
    undefined,
    { camelCase: true },
  );
}

export async function updateDeviceAttribute(
  deviceId: string,
  attributeName: string,
  value: string | number | boolean | null,
): Promise<Device> {
  await request<Device>(
    `/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(attributeName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  return getDevice(deviceId);
}
