import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type { SynopticDocument } from "../types";
import { SynopticsResource } from "./synoptics";

const RESULT = { wire: true };
const DOCUMENT = { name: "ECS" } as SynopticDocument;

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    synoptics: new SynopticsResource(request as unknown as RequestFn),
    request,
  };
}

type Case = [
  string,
  (synoptics: SynopticsResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  ["list", (s) => s.list(), ["GET", "/synoptics/"]],
  ["get", (s) => s.get("ecs est"), ["GET", "/synoptics/ecs%20est"]],
  [
    "create",
    (s) => s.create(DOCUMENT),
    ["POST", "/synoptics/", { body: DOCUMENT }],
  ],
  [
    "replace",
    (s) => s.replace("ecs est", DOCUMENT, "2026-09-17T12:00:00+00:00"),
    [
      "PUT",
      "/synoptics/ecs%20est",
      {
        body: DOCUMENT,
        searchParams: { expected_updated_at: "2026-09-17T12:00:00+00:00" },
      },
    ],
  ],
];

describe("SynopticsResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { synoptics, request } = makeResource();

      await expect(invoke(synoptics)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );
});
