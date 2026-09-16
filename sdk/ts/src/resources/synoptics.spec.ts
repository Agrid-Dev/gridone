import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import { SynopticsResource } from "./synoptics";

const RESULT = { wire: true };

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
