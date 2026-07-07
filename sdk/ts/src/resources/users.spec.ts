import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type { UserCreateRequest, UserUpdateRequest } from "../types";
import { UsersResource } from "./users";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return { users: new UsersResource(request as unknown as RequestFn), request };
}

const CREATE: UserCreateRequest = {
  username: "operator1",
  password: "s3cret",
  role: "operator",
  type: "user",
  name: "Op One",
  email: "op1@example.com",
  title: "Technician",
};
const UPDATE: UserUpdateRequest = { name: "Op One bis" };

type Case = [
  string,
  (users: UsersResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  ["list", (u) => u.list(), ["GET", "/users/"]],
  ["get", (u) => u.get("u1"), ["GET", "/users/u1"]],
  ["create", (u) => u.create(CREATE), ["POST", "/users/", { body: CREATE }]],
  [
    "update",
    (u) => u.update("u1", UPDATE),
    ["PATCH", "/users/u1", { body: UPDATE }],
  ],
  ["delete", (u) => u.delete("u1"), ["DELETE", "/users/u1"]],
  ["block", (u) => u.block("u1"), ["POST", "/users/u1/block"]],
  ["unblock", (u) => u.unblock("u1"), ["POST", "/users/u1/unblock"]],
];

describe("UsersResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { users, request } = makeResource();

      await expect(invoke(users)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );
});
