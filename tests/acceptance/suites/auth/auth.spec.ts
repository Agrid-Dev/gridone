import { GridoneClient, isGridoneError } from "@gridone/sdk";
import { describe, expect, it } from "vitest";

// The stack starts from an empty database, so the default admin user exists.
const baseUrl = process.env.GRIDONE_API ?? "http://localhost:8765/api";
const username = process.env.GRIDONE_USERNAME ?? "admin";
const password = process.env.GRIDONE_PASSWORD ?? "admin";

interface CurrentUser {
  username: string;
  role: string;
}

function makeClient(): GridoneClient {
  return new GridoneClient({ baseUrl });
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

describe("authentication", () => {
  it("rejects wrong credentials with a 401", async () => {
    const error = await rejectionOf(
      makeClient().login(username, `not-${password}`),
    );

    expect(isGridoneError(error) && error.status === 401).toBe(true);
  });

  it("rejects unauthenticated requests with a 401", async () => {
    const error = await rejectionOf(
      makeClient().request<CurrentUser>("GET", "/auth/me"),
    );

    expect(isGridoneError(error) && error.status === 401).toBe(true);
  });

  it("logs in and identifies the current user", async () => {
    const client = makeClient();
    await client.login(username, password);

    const me = await client.request<CurrentUser>("GET", "/auth/me");

    expect(me.username).toBe(username);
    expect(me.role).toBe("admin");
  });

  it("no longer authenticates after logout", async () => {
    const client = makeClient();
    await client.login(username, password);
    await client.logout();

    const error = await rejectionOf(
      client.request<CurrentUser>("GET", "/auth/me"),
    );

    expect(isGridoneError(error) && error.status === 401).toBe(true);
  });
});
