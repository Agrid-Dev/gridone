import { QueryClient } from "@tanstack/react-query";
import type {
  DataPoint,
  Device,
  FetchPointsResultResponse,
  TimeSeries,
} from "@gridone/sdk";
import { API_BASE_URL } from "@/lib/apiConfig";

export type DeviceUpdateMessage = {
  type: "device_update";
  device_id: string;
  attribute: string;
  value: string | number | boolean | null;
  /** Message envelope time (emit time). */
  timestamp?: string | null;
  /** Attribute timestamps carried by the backend (see DeviceUpdateMessage). */
  last_updated?: string | null;
  last_changed?: string | null;
};

export type DeviceFullUpdateMessage = {
  type: "device_full_update";
  device: Device;
};

export type DeviceListUpdateMessage = {
  type: "device_list_update";
  devices: Device[];
};

export type ErrorMessage = { type: "error"; message: string };
export type PingMessage = { type: "ping" | "pong"; timestamp?: string };

export type WebSocketMessage =
  | DeviceUpdateMessage
  | DeviceFullUpdateMessage
  | DeviceListUpdateMessage
  | ErrorMessage
  | PingMessage
  | Record<string, unknown>;

export function buildWebSocketUrl(): string {
  const env = import.meta.env as {
    VITE_WS_BASE_URL?: string;
    VITE_API_BASE_URL?: string;
  };
  const base = env.VITE_WS_BASE_URL ?? env.VITE_API_BASE_URL ?? API_BASE_URL;

  try {
    const url = new URL(base);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${protocol}//${url.host}${pathname}/ws/devices`;
  } catch {
    const sanitized = String(base).replace(/\/+$/, "").replace(/^http/, "ws");
    return `${sanitized}/ws/devices`;
  }
}

/**
 * Applies a partial device_update WS event to a cached Device.
 * Payloads are wire-format snake_case end to end, so the attribute name and
 * fields match the HTTP-fetched cache entries verbatim.
 *
 * The backend sends the attribute's `last_updated` / `last_changed`; we fall
 * back to receive time when absent, and `last_changed` defaults to
 * `last_updated` (a device_update only fires on a value change).
 */
export function applyDeviceUpdate(
  device: Device,
  attribute: string,
  value: string | number | boolean | null,
  lastUpdated?: string | null,
  lastChanged?: string | null,
): Device {
  const existingAttribute = device.attributes?.[attribute];
  if (!existingAttribute) {
    return device;
  }

  const now = new Date().toISOString();
  const updatedAt = lastUpdated ?? now;
  const changedAt = lastChanged ?? lastUpdated ?? now;

  return {
    ...device,
    attributes: {
      ...device.attributes,
      [attribute]: {
        ...existingAttribute,
        current_value: value,
        last_updated: updatedAt,
        last_changed: changedAt,
      },
    },
  };
}

export function createDeviceMessageHandler(queryClient: QueryClient) {
  return (message: WebSocketMessage) => {
    if (typeof message !== "object" || !message || !("type" in message)) {
      return;
    }

    if (message.type === "device_update") {
      const updateMessage = message as DeviceUpdateMessage;

      queryClient.setQueryData<Device | undefined>(
        ["device", updateMessage.device_id],
        (current) =>
          current
            ? applyDeviceUpdate(
                current,
                updateMessage.attribute,
                updateMessage.value,
                updateMessage.last_updated,
                updateMessage.last_changed,
              )
            : current,
      );

      queryClient.setQueryData<Device[] | undefined>(["devices"], (current) =>
        current?.map((device) =>
          device.id === updateMessage.device_id
            ? applyDeviceUpdate(
                device,
                updateMessage.attribute,
                updateMessage.value,
                updateMessage.last_updated,
                updateMessage.last_changed,
              )
            : device,
        ),
      );

      // Append data point to the matching time series cache.
      const seriesList = queryClient.getQueryData<TimeSeries[]>([
        "timeseries",
        "series",
        updateMessage.device_id,
      ]);
      const series = seriesList?.find(
        (s) => s.metric === updateMessage.attribute,
      );
      if (series) {
        const point: DataPoint = {
          // Backend stores the sample at the value's change time.
          timestamp:
            updateMessage.last_changed ??
            updateMessage.last_updated ??
            new Date().toISOString(),
          value: updateMessage.value as DataPoint["value"],
        };
        queryClient.setQueriesData<FetchPointsResultResponse>(
          {
            queryKey: ["timeseries", "points", series.id],
            predicate: (query) => {
              // Only inject into open-ended queries (no fixed end).
              // Queries with a fixed end represent a closed time window
              // where new data points would fall outside the range.
              const end = query.queryKey[4];
              return end === undefined;
            },
          },
          (current) =>
            current
              ? { ...current, points: [...current.points, point] }
              : { points: [point], truncated: false, next_start: null },
        );
      }

      return;
    }

    if (message.type === "device_full_update") {
      const fullUpdateMessage = message as DeviceFullUpdateMessage;
      queryClient.setQueryData(
        ["device", fullUpdateMessage.device.id],
        fullUpdateMessage.device,
      );
      queryClient.setQueryData<Device[] | undefined>(["devices"], (current) => {
        if (!current) {
          return [fullUpdateMessage.device];
        }
        const exists = current.some(
          (d) => d.id === fullUpdateMessage.device.id,
        );
        return exists
          ? current.map((d) =>
              d.id === fullUpdateMessage.device.id
                ? fullUpdateMessage.device
                : d,
            )
          : [...current, fullUpdateMessage.device];
      });
      return;
    }

    if (message.type === "device_list_update") {
      const listUpdateMessage = message as DeviceListUpdateMessage;
      queryClient.setQueryData(["devices"], listUpdateMessage.devices);
      return;
    }
  };
}
