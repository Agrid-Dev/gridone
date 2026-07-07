import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type { AutomationCreate, AutomationUpdate } from "../types";
import { AutomationsResource } from "./automations";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    automations: new AutomationsResource(request as unknown as RequestFn),
    request,
  };
}

const CREATE: AutomationCreate = {
  name: "Night setback",
  description: "",
  trigger: { provider_id: "cron", params: { schedule: "0 22 * * *" } },
  action: { provider_id: "device_command", params: { value: 17 } },
  enabled: true,
};
const UPDATE: AutomationUpdate = {
  name: "Night setback v2",
  description: "Lower setpoints at night",
};

type Case = [
  string,
  (automations: AutomationsResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  [
    "list",
    (a) => a.list({ enabled: true }),
    ["GET", "/automations/", { searchParams: { enabled: true } }],
  ],
  ["get", (a) => a.get("auto1"), ["GET", "/automations/auto1"]],
  [
    "create",
    (a) => a.create(CREATE),
    ["POST", "/automations/", { body: CREATE }],
  ],
  [
    "update",
    (a) => a.update("auto1", UPDATE),
    ["PATCH", "/automations/auto1", { body: UPDATE }],
  ],
  ["delete", (a) => a.delete("auto1"), ["DELETE", "/automations/auto1"]],
  ["enable", (a) => a.enable("auto1"), ["POST", "/automations/auto1/enable"]],
  [
    "disable",
    (a) => a.disable("auto1"),
    ["POST", "/automations/auto1/disable"],
  ],
  [
    "listExecutions",
    (a) => a.listExecutions("auto1"),
    ["GET", "/automations/auto1/executions"],
  ],
  [
    "getTriggerSchemas",
    (a) => a.getTriggerSchemas(),
    ["GET", "/automations/triggers"],
  ],
  [
    "getActionSchemas",
    (a) => a.getActionSchemas(),
    ["GET", "/automations/actions"],
  ],
];

describe("AutomationsResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { automations, request } = makeResource();

      await expect(invoke(automations)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );
});
