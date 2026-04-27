import snakecaseKeys from "snakecase-keys";
import { request } from "./request";

export type ExecutionStatus = "success" | "failed";

export type Trigger = { type: string } & Record<string, unknown>;

export type Automation = {
  id: string;
  name: string;
  trigger: Trigger;
  actionTemplateId: string;
  enabled: boolean;
};

export type AutomationCreate = {
  name: string;
  trigger: Trigger;
  actionTemplateId: string;
  enabled?: boolean;
};

export type AutomationUpdate = Partial<AutomationCreate>;

export type AutomationExecution = {
  id: string;
  automationId: string;
  triggeredAt: string;
  executedAt: string | null;
  status: ExecutionStatus;
  error: string | null;
  outputId: string | null;
};

export type TriggerSchema = Record<string, unknown>;

export function listTriggerSchemas(): Promise<TriggerSchema[]> {
  return request<TriggerSchema[]>("/automations/triggers");
}

export function listAutomations(enabled?: boolean): Promise<Automation[]> {
  const query =
    enabled === undefined ? "" : `?enabled=${enabled ? "true" : "false"}`;
  return request<Automation[]>(`/automations/${query}`, undefined, {
    camelCase: true,
  });
}

export function getAutomation(automationId: string): Promise<Automation> {
  return request<Automation>(
    `/automations/${encodeURIComponent(automationId)}`,
    undefined,
    { camelCase: true },
  );
}

export function createAutomation(
  payload: AutomationCreate,
): Promise<Automation> {
  return request<Automation>(
    "/automations/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        snakecaseKeys(payload as Record<string, unknown>, { deep: true }),
      ),
    },
    { camelCase: true },
  );
}

export function updateAutomation(
  automationId: string,
  payload: AutomationUpdate,
): Promise<Automation> {
  return request<Automation>(
    `/automations/${encodeURIComponent(automationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        snakecaseKeys(payload as Record<string, unknown>, { deep: true }),
      ),
    },
    { camelCase: true },
  );
}

export function deleteAutomation(automationId: string): Promise<void> {
  return request<void>(`/automations/${encodeURIComponent(automationId)}`, {
    method: "DELETE",
  });
}

export function enableAutomation(automationId: string): Promise<Automation> {
  return request<Automation>(
    `/automations/${encodeURIComponent(automationId)}/enable`,
    { method: "POST" },
    { camelCase: true },
  );
}

export function disableAutomation(automationId: string): Promise<Automation> {
  return request<Automation>(
    `/automations/${encodeURIComponent(automationId)}/disable`,
    { method: "POST" },
    { camelCase: true },
  );
}

export function listExecutions(
  automationId: string,
): Promise<AutomationExecution[]> {
  return request<AutomationExecution[]>(
    `/automations/${encodeURIComponent(automationId)}/executions`,
    undefined,
    { camelCase: true },
  );
}
