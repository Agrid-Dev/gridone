import { request } from "./request";

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

export type PaginationLinks = {
  self: string;
  first: string;
  last: string;
  next: string | null;
  prev: string | null;
};

export type CommandsPage = {
  items: DeviceCommand[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  links: PaginationLinks;
};

export type CommandsFilters = {
  deviceId?: string;
  attribute?: string;
  userId?: string;
  start?: string;
  end?: string;
  last?: string;
  sort?: "asc" | "desc";
  page?: number;
  size?: number;
};

const FILTER_TO_PARAM: Record<string, string> = {
  deviceId: "device_id",
  userId: "user_id",
};

export function getCommands(filters: CommandsFilters): Promise<CommandsPage> {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    const paramName = FILTER_TO_PARAM[key] ?? key;
    params.set(paramName, String(value));
  }

  const qs = params.toString();
  return request<CommandsPage>(
    `/devices/commands${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}
