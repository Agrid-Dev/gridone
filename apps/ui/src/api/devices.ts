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

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(relativeUrl: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${relativeUrl}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

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
