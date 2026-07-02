import { TransportProtocol } from "./transports";
import { request } from "./request";

type DriverUpdateStrategy = Record<string, boolean | number>;

type ValueAdapterSpec = {
  adapter: string;
  argument: string | number;
};

type AttributeDataType = "str" | "float" | "int" | "bool";

type Address = Record<string, unknown>;

export type DriverAttribute = {
  name: string;
  dataType: AttributeDataType;
  valueAdapters: ValueAdapterSpec[];
  read?: Address;
  write?: Address;
};

import type { DeviceType } from "./devices";

export type Driver = {
  id: string;
  type: DeviceType | null;
  vendor: string | null;
  model: string | null;
  version: string | null;
  imageSrc: string | null;
  transport: TransportProtocol;
  updateStrategy: DriverUpdateStrategy;
  deviceConfig: {
    name: string;
    required: boolean;
  }[];
  attributes: DriverAttribute[];
  discovery?: Record<string, unknown> | null;
};

export function getDrivers(params?: Record<string, string>): Promise<Driver[]> {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  return request<Driver[]>(`/drivers/${query}`, undefined, { camelCase: true });
}

export function getDriver(driverId: string): Promise<Driver> {
  return request<Driver>(`/drivers/${driverId}`, undefined, {
    camelCase: true,
  });
}

export type DriverCreatePayload = { yaml: string };

// Matches a top-level `id:` field in the driver YAML, e.g. "id: my_driver"
// or "id: 'my_driver'" -> captures `my_driver`.
const DRIVER_ID_FIELD = /^id:\s*["']?([^"'\n\r]+?)["']?\s*$/m;

function extractDriverId(yaml: string): string {
  const match = yaml.match(DRIVER_ID_FIELD);
  if (!match) {
    throw new Error("Driver YAML must include a top-level 'id' field");
  }
  return match[1];
}

export async function createDriver(
  payload: DriverCreatePayload,
): Promise<Driver> {
  const driverId = extractDriverId(payload.yaml);
  return request<Driver>(`/drivers/${driverId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
export async function deleteDriver(driverId: string): Promise<void> {
  return request<void>(`/drivers/${driverId}`, {
    method: "DELETE",
  });
}
