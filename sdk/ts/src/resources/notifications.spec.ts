import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type { DispatchNotificationRequest } from "../types";
import { NotificationsResource } from "./notifications";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    notifications: new NotificationsResource(request as unknown as RequestFn),
    request,
  };
}

const DISPATCH: DispatchNotificationRequest = {
  title: "Filter change due",
  body: "AHU-2 filter pressure drop above threshold",
  severity: "warning",
  user_ids: ["u1", "u2"],
};

type Case = [
  string,
  (notifications: NotificationsResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  [
    "list",
    (n) => n.list({ dismissed: false, page: 1 }),
    ["GET", "/notifications/", { searchParams: { dismissed: false, page: 1 } }],
  ],
  [
    "dispatch",
    (n) => n.dispatch(DISPATCH),
    ["POST", "/notifications/", { body: DISPATCH }],
  ],
  ["dismiss", (n) => n.dismiss("n1"), ["POST", "/notifications/n1/dismiss"]],
];

describe("NotificationsResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { notifications, request } = makeResource();

      await expect(invoke(notifications)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );
});
