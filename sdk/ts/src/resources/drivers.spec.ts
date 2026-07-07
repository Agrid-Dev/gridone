import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type {
  AttributeDriver,
  AttributePatch,
  AttributeRename,
  DriverPatch,
  DriverYaml,
} from "../types";
import { DriversResource } from "./drivers";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    drivers: new DriversResource(request as unknown as RequestFn),
    request,
  };
}

const YAML: DriverYaml = { yaml: "id: acme_meter\n" };
const PATCH: DriverPatch = { vendor: "Acme" };
const ATTR_PATCH: AttributePatch = { healthy_values: [1, 2] };
const RENAME: AttributeRename = { new_name: "airflow" };
const ATTR: AttributeDriver = {
  kind: "standard",
  name: "flow",
  data_type: "float",
  read: "1/2/3",
};

type Case = [
  string,
  (drivers: DriversResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  [
    "list",
    (d) => d.list({ type: "electricity_meter" }),
    ["GET", "/drivers/", { searchParams: { type: "electricity_meter" } }],
  ],
  ["get", (d) => d.get("drv1"), ["GET", "/drivers/drv1"]],
  [
    "create",
    (d) => d.create("drv1", YAML),
    ["PUT", "/drivers/drv1", { body: YAML }],
  ],
  [
    "update",
    (d) => d.update("drv1", PATCH),
    ["PATCH", "/drivers/drv1", { body: PATCH }],
  ],
  ["delete", (d) => d.delete("drv1"), ["DELETE", "/drivers/drv1"]],
  [
    "setAttribute",
    (d) => d.setAttribute("drv1", "flow", ATTR),
    ["PUT", "/drivers/drv1/attributes/flow", { body: ATTR }],
  ],
  [
    "updateAttribute",
    (d) => d.updateAttribute("drv1", "flow", ATTR_PATCH),
    ["PATCH", "/drivers/drv1/attributes/flow", { body: ATTR_PATCH }],
  ],
  [
    "deleteAttribute",
    (d) => d.deleteAttribute("drv1", "flow"),
    ["DELETE", "/drivers/drv1/attributes/flow"],
  ],
  [
    "renameAttribute",
    (d) => d.renameAttribute("drv1", "flow", RENAME),
    ["POST", "/drivers/drv1/attributes/flow/rename", { body: RENAME }],
  ],
];

describe("DriversResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { drivers, request } = makeResource();

      await expect(invoke(drivers)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );
});
