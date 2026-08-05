import type { Device, Transport } from "@gridone/sdk";

export type TransportDeviceSummary = {
  count: number;
  driverIds: string[];
};

/** Build the UI-only rollup used by the network list and detail views. */
export function summarizeTransportDevices(
  devices: readonly Device[],
): Map<string, TransportDeviceSummary> {
  const summaries = new Map<
    string,
    { count: number; driverIds: Set<string> }
  >();

  for (const device of devices) {
    const summary = summaries.get(device.transport_id) ?? {
      count: 0,
      driverIds: new Set<string>(),
    };
    summary.count += 1;
    summary.driverIds.add(device.driver_id);
    summaries.set(device.transport_id, summary);
  }

  return new Map(
    [...summaries].map(([transportId, summary]) => [
      transportId,
      {
        count: summary.count,
        driverIds: [...summary.driverIds].sort((a, b) => a.localeCompare(b)),
      },
    ]),
  );
}

const DEFAULT_PORTS: Partial<Record<Transport["protocol"], number>> = {
  knx: 3671,
  mqtt: 1883,
  "modbus-tcp": 502,
  bacnet: 47808,
};

/** Compact endpoint shown in the network table (for example 10.0.0.30:3671). */
export function transportEndpoint(transport: Transport): string | null {
  const config = transport.config as Record<string, unknown>;
  const host =
    transport.protocol === "knx"
      ? config.gateway_ip
      : transport.protocol === "bacnet"
        ? config.ip_with_mask
        : config.host;

  if (typeof host !== "string" || host.length === 0) return null;

  const port = config.port ?? DEFAULT_PORTS[transport.protocol];
  return typeof port === "number" || typeof port === "string"
    ? `${host}:${port}`
    : host;
}

const SENSITIVE_CONFIG_KEY = /(password|secret|token|certificate|cert|key)/i;

/** Present arbitrary schema-driven config without exposing credentials. */
export function presentTransportConfigValue(
  key: string,
  value: unknown,
  booleanLabel: (value: boolean) => string,
): string {
  if (SENSITIVE_CONFIG_KEY.test(key)) return "••••••••";
  if (typeof value === "boolean") return booleanLabel(value);
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
