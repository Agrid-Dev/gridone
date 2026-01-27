import { request } from "./request";

export type DeviceAttribute = {
  name: string;
  data_type: "int" | "float" | "bool" | "string" | string;
  read_write_modes: Array<"read" | "write" | string>;
  current_value: string | number | boolean | null;
  last_updated: string | null;
};

export type Device = {
  id: string;
  driver: string;
  config: Record<string, unknown>;
  attributes: Record<string, DeviceAttribute>;
};

export function listDevices(): Promise<Device[]> {
  return request<Device[]>("/devices/");
}

export function getDevice(deviceId: string): Promise<Device> {
  return request<Device>(`/devices/${encodeURIComponent(deviceId)}`);
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
