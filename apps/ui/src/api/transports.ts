import { request, API_BASE_URL } from "./request";
import snakecaseKeys from "snakecase-keys";

export const transportProtocols = [
  "mqtt",
  "http",
  "modbus-tcp",
  "bacnet",
] as const;

export type TransportProtocol = (typeof transportProtocols)[number];

export type TransportConnectionState = {
  status:
    | "idle"
    | "connecting"
    | "connected"
    | "connection_error"
    | "closing"
    | "closed";
  info?: string | null;
};

export type Transport = {
  id: string;
  name: string;
  protocol: TransportProtocol;
  config: Record<string, unknown>;
  connectionState: TransportConnectionState;
};

export type JsonSchemaProperty = {
  type?: "string" | "number" | "integer" | "boolean" | "object";
  title?: string;
  description?: string;
  default?: string | number | boolean | null;
  enum?: Array<string | number>;
  anyOf?: JsonSchemaProperty[];
  oneOf?: JsonSchemaProperty[];
};

export type TransportSchema = {
  title?: string;
  type?: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

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
  const response = await fetch(
    `${API_BASE_URL}/transports/${encodeURIComponent(transportId)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
}

export function getTransportSchemas(): Promise<TransportSchemas> {
  return request<TransportSchemas>("/transports/schemas/");
}

export function listTransports(): Promise<Transport[]> {
  return request<Transport[]>("/transports/", undefined, { camelCase: true });
}

export function getTransport(transportId: string): Promise<Transport> {
  return request<Transport>(`/transports/${encodeURIComponent(transportId)}`);
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
