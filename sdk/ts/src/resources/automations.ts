import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  Automation,
  AutomationCreate,
  AutomationExecution,
  AutomationUpdate,
  AutomationDiagnostic,
} from "../types";

export type AutomationListParams = NonNullable<
  operations["list_automations_automations__get"]["parameters"]["query"]
>;

/** JSON schemas of the available providers, keyed by provider id. */
export type ProviderSchemas = Record<string, Record<string, unknown>>;

/** `client.automations` — trigger/action workflows. */
export class AutomationsResource {
  constructor(private readonly request: RequestFn) {}

  list(params?: AutomationListParams): Promise<Automation[]> {
    return this.request("GET", "/automations/", { searchParams: params });
  }

  get(automationId: string): Promise<Automation> {
    return this.request(
      "GET",
      `/automations/${encodeURIComponent(automationId)}`,
    );
  }

  create(params: AutomationCreate): Promise<Automation> {
    return this.request("POST", "/automations/", { body: params });
  }

  update(automationId: string, params: AutomationUpdate): Promise<Automation> {
    return this.request(
      "PATCH",
      `/automations/${encodeURIComponent(automationId)}`,
      { body: params },
    );
  }

  delete(automationId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/automations/${encodeURIComponent(automationId)}`,
    );
  }

  enable(automationId: string): Promise<Automation> {
    return this.request(
      "POST",
      `/automations/${encodeURIComponent(automationId)}/enable`,
    );
  }

  /** Disable the automation, optionally saying why; the server records who
   *  did it and when as the automation's `deactivation`. */
  disable(automationId: string, reason?: string): Promise<Automation> {
    const path = `/automations/${encodeURIComponent(automationId)}/disable`;
    return reason === undefined
      ? this.request("POST", path)
      : this.request("POST", path, { body: { reason } });
  }

  schema(): Promise<Record<string, unknown>> {
    return this.request("GET", "/automations/schema");
  }

  listDiagnostics(automationId: string): Promise<AutomationDiagnostic[]> {
    return this.request(
      "GET",
      `/automations/${encodeURIComponent(automationId)}/diagnostics`,
    );
  }

  listExecutions(automationId: string): Promise<AutomationExecution[]> {
    return this.request(
      "GET",
      `/automations/${encodeURIComponent(automationId)}/executions`,
    );
  }

  getTriggerSchemas(): Promise<ProviderSchemas> {
    return this.request("GET", "/automations/triggers");
  }

  getActionSchemas(): Promise<ProviderSchemas> {
    return this.request("GET", "/automations/actions");
  }
}
