import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type { TransportCreate, TransportUpdate } from "../types";
import { TransportsResource } from "./transports";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    transports: new TransportsResource(request as unknown as RequestFn),
    request,
  };
}

const CREATE: TransportCreate = {
  name: "Main MQTT broker",
  protocol: "mqtt",
  config: { host: "broker.local" },
};
const UPDATE: TransportUpdate = { name: "Backup MQTT broker" };

type Case = [
  string,
  (transports: TransportsResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  ["list", (t) => t.list(), ["GET", "/transports/"]],
  ["get", (t) => t.get("trp1"), ["GET", "/transports/trp1"]],
  [
    "create",
    (t) => t.create(CREATE),
    ["POST", "/transports/", { body: CREATE }],
  ],
  [
    "update",
    (t) => t.update("trp1", UPDATE),
    ["PATCH", "/transports/trp1", { body: UPDATE }],
  ],
  ["delete", (t) => t.delete("trp1"), ["DELETE", "/transports/trp1"]],
  ["getSchemas", (t) => t.getSchemas(), ["GET", "/transports/schemas/"]],
  [
    "listDiscoveryHandlers",
    (t) => t.listDiscoveryHandlers("trp1"),
    ["GET", "/transports/trp1/discovery/"],
  ],
  [
    "createDiscoveryHandler",
    (t) => t.createDiscoveryHandler("trp1", { driver_id: "drv1" }),
    ["POST", "/transports/trp1/discovery/", { body: { driver_id: "drv1" } }],
  ],
  [
    "deleteDiscoveryHandler",
    (t) => t.deleteDiscoveryHandler("trp1", "drv1"),
    ["DELETE", "/transports/trp1/discovery/drv1"],
  ],
];

describe("TransportsResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { transports, request } = makeResource();

      await expect(invoke(transports)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );
});
