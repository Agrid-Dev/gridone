import { request } from "./request";
import type { Page } from "./pagination";

export type DeviceCommand = {
  id: number;
  deviceId: string;
  attribute: string;
  userId: string;
  value: string | number | boolean;
  dataType: "int" | "float" | "str" | "bool";
  status: "success" | "error";
  timestamp: string;
  statusDetails: string | null;
};

export function getCommands(
  params: URLSearchParams,
): Promise<Page<DeviceCommand>> {
  const qs = params.toString();
  return request<Page<DeviceCommand>>(
    `/devices/commands${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}

export function getCommandsByIds(ids: number[]): Promise<Page<DeviceCommand>> {
  const params = new URLSearchParams();
  for (const id of ids) params.append("ids", String(id));
  return request<Page<DeviceCommand>>(
    `/devices/commands?${params.toString()}`,
    undefined,
    { camelCase: true },
  );
}

export function getDeviceCommands(
  deviceId: string,
  params: URLSearchParams,
): Promise<Page<DeviceCommand>> {
  const qs = params.toString();
  return request<Page<DeviceCommand>>(
    `/devices/${deviceId}/commands${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}
