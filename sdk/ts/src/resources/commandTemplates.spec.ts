import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type {
  CommandTemplateCreatePayload,
  CommandTemplateUpdatePayload,
} from "../types";
import { CommandTemplatesResource } from "./commandTemplates";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    templates: new CommandTemplatesResource(request as unknown as RequestFn),
    request,
  };
}

const CREATE: CommandTemplateCreatePayload = {
  name: "Night setback",
  target: { tags: { zone: ["roof"] } },
  write: { attribute: "setpoint", value: 17, data_type: "float" },
};
const UPDATE: CommandTemplateUpdatePayload = { name: "Night setback v2" };

type Case = [
  string,
  (templates: CommandTemplatesResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  [
    "list",
    (t) => t.list({ page: 1, size: 10 }),
    [
      "GET",
      "/devices/commands/templates/",
      { searchParams: { page: 1, size: 10 } },
    ],
  ],
  ["get", (t) => t.get("tpl1"), ["GET", "/devices/commands/templates/tpl1"]],
  [
    "create",
    (t) => t.create(CREATE),
    ["POST", "/devices/commands/templates/", { body: CREATE }],
  ],
  [
    "update",
    (t) => t.update("tpl1", UPDATE),
    ["PATCH", "/devices/commands/templates/tpl1", { body: UPDATE }],
  ],
  [
    "delete",
    (t) => t.delete("tpl1"),
    ["DELETE", "/devices/commands/templates/tpl1"],
  ],
  [
    "dispatch",
    (t) => t.dispatch("tpl1"),
    ["POST", "/devices/commands/templates/tpl1/dispatch"],
  ],
];

describe("CommandTemplatesResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { templates, request } = makeResource();

      await expect(invoke(templates)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );
});
