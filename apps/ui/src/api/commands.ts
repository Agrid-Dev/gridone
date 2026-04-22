import snakecaseKeys from "snakecase-keys";
import { request } from "./request";
import type { DevicesFilter } from "./devices";
import type { Page } from "./pagination";

export type AttributeValue = string | number | boolean;

export type AttributeDataType = "int" | "float" | "str" | "bool";

export type SingleCommandPayload = {
  attribute: string;
  value: AttributeValue;
};

export type BatchCommandPayload = {
  target: DevicesFilter;
  attribute: string;
  value: AttributeValue;
};

export type AssetCommandPayload = {
  attribute: string;
  value: AttributeValue;
  deviceType: string;
  recursive: boolean;
};

export type BatchDispatchResponse = {
  batchId: string;
  total: number;
};

export type CommandStatus = "pending" | "success" | "error";

export type DeviceCommand = {
  id: number;
  batchId: string | null;
  templateId: string | null;
  deviceId: string;
  attribute: string;
  userId: string;
  value: string | number | boolean;
  dataType: AttributeDataType;
  status: CommandStatus;
  createdAt: string;
  executedAt: string;
  completedAt: string | null;
  statusDetails: string | null;
};

export type AttributeWrite = {
  attribute: string;
  value: AttributeValue;
  dataType: AttributeDataType;
};

export type CommandTemplate = {
  id: string;
  name: string | null;
  target: DevicesFilter;
  write: AttributeWrite;
  createdAt: string;
  createdBy: string;
};

export type CommandTemplateCreatePayload = {
  target: DevicesFilter;
  write: AttributeWrite;
  name: string;
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

// ---------------------------------------------------------------------------
// Command templates
// ---------------------------------------------------------------------------

export function listTemplates(
  params?: URLSearchParams,
): Promise<Page<CommandTemplate>> {
  const qs = params?.toString();
  return request<Page<CommandTemplate>>(
    `/devices/command-templates/${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}

export function getTemplate(templateId: string): Promise<CommandTemplate> {
  return request<CommandTemplate>(
    `/devices/command-templates/${encodeURIComponent(templateId)}`,
    undefined,
    { camelCase: true },
  );
}

export function createTemplate(
  payload: CommandTemplateCreatePayload,
): Promise<CommandTemplate> {
  return request<CommandTemplate>(
    "/devices/command-templates/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snakecaseKeys(payload)),
    },
    { camelCase: true },
  );
}

export function deleteTemplate(templateId: string): Promise<void> {
  return request<void>(
    `/devices/command-templates/${encodeURIComponent(templateId)}`,
    { method: "DELETE" },
    { camelCase: true },
  );
}

export function dispatchTemplate(
  templateId: string,
): Promise<BatchDispatchResponse> {
  return request<BatchDispatchResponse>(
    `/devices/command-templates/${encodeURIComponent(templateId)}/dispatch`,
    { method: "POST" },
    { camelCase: true },
  );
}
