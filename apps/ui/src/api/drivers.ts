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

// Matches the raw value of a top-level `id:` field in the driver YAML, e.g.
// "id: my_driver" or "id: 'my_driver'" -> captures `my_driver` (unquoted) or
// `"my_driver"` / `'my_driver'` (quoted, quotes stripped separately below).
const DRIVER_ID_LINE = /^id:[ \t]*(.+?)[ \t]*$/m;

// Matches a fully-quoted scalar, e.g. `"my_driver"` or `'my_driver'`.
const QUOTED_SCALAR = /^(["'])((?:(?!\1).)*)\1$/;

export function extractDriverId(yaml: string): string {
  const line = yaml.match(DRIVER_ID_LINE);
  if (!line) {
    throw new Error("Driver YAML must include a top-level 'id' field");
  }
  const rawValue = line[1];
  const quoted = rawValue.match(QUOTED_SCALAR);
  // Unquoted YAML comments start at whitespace followed by "#"; a quoted
  // scalar's content (including any "#") is never treated as a comment.
  const id = quoted ? quoted[2] : rawValue.split(/[ \t]+#/)[0].trim();
  if (!id) {
    throw new Error("Driver YAML must include a top-level 'id' field");
  }
  return id;
}

export async function createDriver(
  payload: DriverCreatePayload,
): Promise<Driver> {
  const driverId = extractDriverId(payload.yaml);
  return request<Driver>(`/drivers/${encodeURIComponent(driverId)}`, {
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
