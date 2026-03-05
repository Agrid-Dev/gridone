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
