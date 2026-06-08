import camelcase from "camelcase";
import camelcaseKeys from "camelcase-keys";
import { QueryClient } from "@tanstack/react-query";
import { Device } from "@/api/devices";
import { API_BASE_URL } from "./request";
import type { DataPoint, SeriesPointsResult, TimeSeries } from "./timeseries";

export type DeviceUpdateMessage = {
  type: "device_update";
  deviceId: string;
  attribute: string;
  value: string | number | boolean | null;
  timestamp?: string | null;
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
 * `attribute` must already be camelCase to match the HTTP-fetched cache keys.
 */
export function applyDeviceUpdate(
  device: Device,
  attribute: string,
  value: string | number | boolean | null,
  timestamp?: string | null,
): Device {
  const existingAttribute = device.attributes[attribute];
  if (!existingAttribute) {
    return device;
  }

  return {
    ...device,
    attributes: {
      ...device.attributes,
      [attribute]: {
        ...existingAttribute,
        currentValue: value,
        lastUpdated: timestamp ?? new Date().toISOString(),
      },
    },
  };
}

export function createDeviceMessageHandler(queryClient: QueryClient) {
  return (rawMessage: WebSocketMessage) => {
    if (
      typeof rawMessage !== "object" ||
      !rawMessage ||
      !("type" in rawMessage)
    ) {
      return;
    }

    // Normalise all keys to camelCase once, mirroring the HTTP layer transform.
    // This ensures WS payloads are structurally identical to HTTP-fetched cache entries.
    const message = camelcaseKeys(rawMessage as Record<string, unknown>, {
      deep: true,
      preserveConsecutiveUppercase: true,
    }) as WebSocketMessage;

    if (message.type === "device_update") {
      const updateMessage = message as DeviceUpdateMessage;
      // `attribute` is a VALUE (not a key) so camelcaseKeys leaves it as snake_case.
      // Use the same `camelcase` package that camelcase-keys uses internally so
      // digit-bearing names (e.g. "setpoint_1") resolve identically to the cache keys.
      const attributeKey = camelcase(updateMessage.attribute, {
        preserveConsecutiveUppercase: true,
      });

      queryClient.setQueryData<Device | undefined>(
        ["device", updateMessage.deviceId],
        (current) =>
          current
            ? applyDeviceUpdate(
                current,
                attributeKey,
                updateMessage.value,
                updateMessage.timestamp,
              )
            : current,
      );

      queryClient.setQueryData<Device[] | undefined>(["devices"], (current) =>
        current?.map((device) =>
          device.id === updateMessage.deviceId
            ? applyDeviceUpdate(
                device,
                attributeKey,
                updateMessage.value,
                updateMessage.timestamp,
              )
            : device,
        ),
      );

      // Append data point to the matching time series cache.
      // Timeseries metrics are stored as raw snake_case values, so compare against
      // the original attribute name (not the camelCased key).
      const seriesList = queryClient.getQueryData<TimeSeries[]>([
        "timeseries",
        "series",
        updateMessage.deviceId,
      ]);
      const series = seriesList?.find(
        (s) => s.metric === updateMessage.attribute,
      );
      if (series) {
        const point: DataPoint = {
          timestamp: updateMessage.timestamp ?? new Date().toISOString(),
          value: updateMessage.value as DataPoint["value"],
        };
        queryClient.setQueriesData<SeriesPointsResult>(
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
