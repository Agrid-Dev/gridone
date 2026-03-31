import { request } from "./request";

export type AppStatus = "registered" | "healthy" | "unhealthy";

export type App = {
  id: string;
  userId: string;
  name: string;
  description: string;
  apiUrl: string;
  icon: string;
  status: AppStatus;
  manifest: string;
  createdAt: string;
  healthUrl: string;
  enableUrl: string;
};

export type RegistrationRequestStatus = "pending" | "accepted" | "discarded";

export type RegistrationRequest = {
  id: string;
  username: string;
  status: RegistrationRequestStatus;
  createdAt: string;
  config: string;
};

export function listApps(): Promise<App[]> {
  return request<App[]>("/apps/", undefined, { camelCase: true });
}

export function getApp(appId: string): Promise<App> {
  return request<App>(`/apps/${encodeURIComponent(appId)}`, undefined, {
    camelCase: true,
  });
}

export function enableApp(appId: string): Promise<App> {
  return request<App>(
    `/apps/${encodeURIComponent(appId)}/enable`,
    { method: "POST" },
    { camelCase: true },
  );
}

export function disableApp(appId: string): Promise<App> {
  return request<App>(
    `/apps/${encodeURIComponent(appId)}/disable`,
    { method: "POST" },
    { camelCase: true },
  );
}

// ── Config ──────────────────────────────────────────────────

export type JsonSchemaProperty = {
  type?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
};

export type AppConfigSchema = {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

export function getAppConfigSchema(appId: string): Promise<AppConfigSchema> {
  return request<AppConfigSchema>(
    `/apps/${encodeURIComponent(appId)}/config/schema`,
  );
}

export function getAppConfig(appId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/apps/${encodeURIComponent(appId)}/config`,
  );
}

export function updateAppConfig(
  appId: string,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/apps/${encodeURIComponent(appId)}/config`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    },
  );
}

// ── Registration ────────────────────────────────────────────

export function listRegistrationRequests(): Promise<RegistrationRequest[]> {
  return request<RegistrationRequest[]>(
    "/apps/registration-requests",
    undefined,
    { camelCase: true },
  );
}

export function acceptRegistrationRequest(
  requestId: string,
): Promise<RegistrationRequest> {
  return request<RegistrationRequest>(
    `/apps/registration-requests/${encodeURIComponent(requestId)}/accept`,
    { method: "POST" },
    { camelCase: true },
  );
}

export function discardRegistrationRequest(
  requestId: string,
): Promise<RegistrationRequest> {
  return request<RegistrationRequest>(
    `/apps/registration-requests/${encodeURIComponent(requestId)}/discard`,
    { method: "POST" },
    { camelCase: true },
  );
}
