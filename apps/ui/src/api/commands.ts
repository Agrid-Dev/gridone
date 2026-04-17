import snakecaseKeys from "snakecase-keys";
import { request } from "./request";
import type { Page } from "./pagination";

export type AttributeValue = string | number | boolean;

export type SingleCommandPayload = {
  attribute: string;
  value: AttributeValue;
};

export type BatchCommandPayload = {
  attribute: string;
  value: AttributeValue;
  deviceIds?: string[];
  deviceType?: string;
};

export type AssetCommandPayload = {
  attribute: string;
  value: AttributeValue;
  deviceType: string;
  recursive: boolean;
};

export type BatchDispatchResponse = {
  groupId: string;
  total: number;
};

export type CommandStatus = "pending" | "success" | "error";

export type DeviceCommand = {
  id: number;
  groupId: string | null;
  deviceId: string;
  attribute: string;
  userId: string;
  value: string | number | boolean;
  dataType: "int" | "float" | "str" | "bool";
  status: CommandStatus;
  createdAt: string;
  executedAt: string;
  completedAt: string | null;
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

export function dispatchSingleCommand(
  deviceId: string,
  payload: SingleCommandPayload,
): Promise<DeviceCommand> {
  return request<DeviceCommand>(
    `/devices/${encodeURIComponent(deviceId)}/commands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snakecaseKeys(payload)),
    },
    { camelCase: true },
  );
}

export function dispatchBatchCommand(
  payload: BatchCommandPayload,
): Promise<BatchDispatchResponse> {
  return request<BatchDispatchResponse>(
    "/devices/commands",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snakecaseKeys(payload)),
    },
    { camelCase: true },
  );
}

export function dispatchAssetCommand(
  assetId: string,
  payload: AssetCommandPayload,
): Promise<BatchDispatchResponse> {
  return request<BatchDispatchResponse>(
    `/assets/${encodeURIComponent(assetId)}/commands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snakecaseKeys(payload)),
    },
    { camelCase: true },
  );
}
