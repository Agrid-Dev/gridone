import type { RequestFn } from "../http/httpClient";
import type {
  OperatingRule,
  OperatingRuleDefinition,
  OperatingRuleView,
  OperatingRuleUpdate,
  OperatingRuleRetire,
  OperatingRuleSchemas,
} from "../types";

const path = (id: string) => `/operating-rules/${encodeURIComponent(id)}`;

export class OperatingRulesResource {
  constructor(private readonly request: RequestFn) {}

  schemas(): Promise<OperatingRuleSchemas> {
    return this.request("GET", "/operating-rules/schema");
  }
  list(deviceId?: string): Promise<OperatingRuleView[]> {
    return this.request("GET", "/operating-rules/", {
      searchParams: { device_id: deviceId },
    });
  }
  get(id: string): Promise<OperatingRuleView> {
    return this.request("GET", path(id));
  }
  create(body: OperatingRuleDefinition): Promise<OperatingRule> {
    return this.request("POST", "/operating-rules/", { body });
  }
  update(id: string, body: OperatingRuleUpdate): Promise<OperatingRule> {
    return this.request("PUT", path(id), { body });
  }
  history(id: string): Promise<OperatingRule[]> {
    return this.request("GET", `${path(id)}/history`);
  }
  retire(id: string, body: OperatingRuleRetire): Promise<OperatingRule> {
    return this.request("POST", `${path(id)}/retire`, { body });
  }
}
