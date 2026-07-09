import { request } from "./request";
import snakecaseKeys from "snakecase-keys";

export const transportProtocols = [
  "mqtt",
  "http",
  "modbus-tcp",
  "bacnet",
] as const;

export type TransportProtocol = (typeof transportProtocols)[number];

export type TransportConnectionState = {
  status: "idle" | "ok" | "degraded" | "error";
  info?: string | null;
};

export type Transport = {
  id: string;
  name: string;
  protocol: TransportProtocol;
  config: Record<string, unknown>;
  connectionState: TransportConnectionState;
  // Names of secret config fields that currently hold a value. Their values in
  // `config` are always null (write-only); this list is how the form knows a
  // secret is set without ever receiving it.
  configuredSecrets: string[];
};

export type JsonSchemaProperty = {
  type?: "string" | "number" | "integer" | "boolean" | "object";
  title?: string;
  description?: string;
  default?: string | number | boolean | null;
  enum?: Array<string | number>;
  anyOf?: JsonSchemaProperty[];
  oneOf?: JsonSchemaProperty[];
  multiline?: boolean;
  secret?: boolean;
  $ref?: string;
};

export type TransportSchema = {
  title?: string;
  type?: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  $defs?: Record<string, TransportSchema>;
};

// Resolves a `$ref`-based object property (e.g. KNX's secure_credentials, a
// nested model) against the schema's own `$defs`, so a secret field whose
// value is a structured object can be rendered as one sub-input per property
// instead of a single scalar input.
export function resolveObjectSchema(
  property: JsonSchemaProperty,
  defs: TransportSchema["$defs"],
): TransportSchema | undefined {
  const ref = property.$ref ?? property.anyOf?.find((p) => p.$ref)?.$ref;
  const defName = ref?.replace("#/$defs/", "");
  return defName ? defs?.[defName] : undefined;
}

export type TransportSchemas = Record<TransportProtocol, TransportSchema>;

export type TransportCreatePayload = {
  name: string;
  protocol: TransportProtocol;
  config: Record<string, unknown>;
};

export type TransportUpdatePayload = Omit<TransportCreatePayload, "protocol">;

export type DiscoveryHandler = {
  driverId: string;
  transportId: string;
  enabled: boolean;
};

export async function deleteTransport(transportId: string): Promise<void> {
  return request<void>(`/transports/${encodeURIComponent(transportId)}`, {
    method: "DELETE",
  });
}

export function getTransportSchemas(): Promise<TransportSchemas> {
  return request<TransportSchemas>("/transports/schemas/");
}

export function listTransports(): Promise<Transport[]> {
  return request<Transport[]>("/transports/", undefined, { camelCase: true });
}

export function getTransport(transportId: string): Promise<Transport> {
  return request<Transport>(
    `/transports/${encodeURIComponent(transportId)}`,
    undefined,
    { camelCase: true },
  );
}

export function createTransport(
  payload: TransportCreatePayload,
): Promise<Transport> {
  return request<Transport>("/transports/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snakecaseKeys(payload, { deep: true })),
  });
}

export function updateTransport(
  transportId: string,
  payload: TransportUpdatePayload,
): Promise<Transport> {
  return request<Transport>(`/transports/${encodeURIComponent(transportId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snakecaseKeys(payload, { deep: true })),
  });
}

export function createTransportDiscovery(
  transportId: string,
  driverId: string,
): Promise<DiscoveryHandler> {
  return request<DiscoveryHandler>(
    `/transports/${encodeURIComponent(transportId)}/discovery/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snakecaseKeys({ driverId })),
    },
    { camelCase: true },
  );
}

export function listTransportDiscoveries(
  transportId: string,
): Promise<DiscoveryHandler[]> {
  return request<DiscoveryHandler[]>(
    `/transports/${encodeURIComponent(transportId)}/discovery/`,
    undefined,
    { camelCase: true },
  );
}

export function deleteTransportDiscovery(
  transportId: string,
  driverId: string,
): Promise<void> {
  return request<void>(
    `/transports/${encodeURIComponent(transportId)}/discovery/${encodeURIComponent(driverId)}`,
    { method: "DELETE" },
  );
}
