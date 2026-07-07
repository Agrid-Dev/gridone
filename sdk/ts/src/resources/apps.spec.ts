import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type { RegistrationRequestCreateBody } from "../types";
import { AppRegistrationRequestsResource, AppsResource } from "./apps";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return { apps: new AppsResource(request as unknown as RequestFn), request };
}

const REGISTRATION: RegistrationRequestCreateBody = {
  username: "energy-app",
  password: "s3cret",
  config: "{}",
};

type Case = [
  string,
  (apps: AppsResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  ["list", (a) => a.list(), ["GET", "/apps/"]],
  ["get", (a) => a.get("app1"), ["GET", "/apps/app1"]],
  ["enable", (a) => a.enable("app1"), ["POST", "/apps/app1/enable"]],
  ["disable", (a) => a.disable("app1"), ["POST", "/apps/app1/disable"]],
  ["getConfig", (a) => a.getConfig("app1"), ["GET", "/apps/app1/config"]],
  [
    "updateConfig",
    (a) => a.updateConfig("app1", { interval: 60 }),
    ["PATCH", "/apps/app1/config", { body: { interval: 60 } }],
  ],
  [
    "getConfigSchema",
    (a) => a.getConfigSchema("app1"),
    ["GET", "/apps/app1/config/schema"],
  ],
  [
    "registrationRequests.list",
    (a) => a.registrationRequests.list(),
    ["GET", "/apps/registration-requests"],
  ],
  [
    "registrationRequests.get",
    (a) => a.registrationRequests.get("req1"),
    ["GET", "/apps/registration-requests/req1"],
  ],
  [
    "registrationRequests.create",
    (a) => a.registrationRequests.create(REGISTRATION),
    ["POST", "/apps/registration-requests", { body: REGISTRATION }],
  ],
  [
    "registrationRequests.accept",
    (a) => a.registrationRequests.accept("req1"),
    ["POST", "/apps/registration-requests/req1/accept"],
  ],
  [
    "registrationRequests.discard",
    (a) => a.registrationRequests.discard("req1"),
    ["POST", "/apps/registration-requests/req1/discard"],
  ],
];

describe("AppsResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { apps, request } = makeResource();

      await expect(invoke(apps)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );

  it("exposes registration requests on the shared request function", () => {
    const { apps } = makeResource();

    expect(apps.registrationRequests).toBeInstanceOf(
      AppRegistrationRequestsResource,
    );
  });
});
