import { describe, expect, it, vi } from "vitest";

import { GridoneClient } from "./client";
import { GridoneError, NetworkError } from "./errors";
import { MemoryTokenStorage } from "./http/tokenStorage";

const BASE_URL = "http://api.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenResponse(access: string, refresh: string): Response {
  return jsonResponse({
    access_token: access,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 900,
  });
}

function makeClient(fetchMock: typeof globalThis.fetch) {
  const storage = new MemoryTokenStorage();
  // Trailing slash on purpose: the client must normalize it away.
  const client = new GridoneClient({
    baseUrl: `${BASE_URL}/`,
    tokenStorage: storage,
    fetch: fetchMock,
  });
  return { client, storage };
}

function callOf(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const call = fetchMock.mock.calls[index];
  if (!call) {
    throw new Error(`fetch call ${index} not found`);
  }
  const [input, init] = call as [unknown, RequestInit | undefined];
  return {
    url: String(input),
    init,
    headers: (init?.headers ?? {}) as Record<string, string>,
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected promise to reject");
    },
    (error: unknown) => error,
  );
}

describe("request", () => {
  it("performs a JSON request and parses the wire-format response", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: "abc", proven_flow: 2 }),
    );
    const { client } = makeClient(fetchMock);

    const thing = await client.request<{ id: string; proven_flow: number }>(
      "GET",
      "/things/abc",
    );

    expect(thing).toEqual({ id: "abc", proven_flow: 2 });
    expect(callOf(fetchMock).url).toBe(`${BASE_URL}/things/abc`);
    expect(callOf(fetchMock).headers["Authorization"]).toBeUndefined();
  });

  it("serializes the body as JSON without touching key casing", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "abc" }));
    const { client } = makeClient(fetchMock);

    await client.request("POST", "/things", {
      body: { display_name: "Fan", proven_flow: 2 },
    });

    const { init, headers } = callOf(fetchMock);
    expect(init?.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.body).toBe('{"display_name":"Fan","proven_flow":2}');
  });

  it("appends search params and skips undefined values", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    const { client } = makeClient(fetchMock);

    await client.request("GET", "/things", {
      searchParams: { page: 2, q: "a b", missing: undefined },
    });

    expect(callOf(fetchMock).url).toBe(`${BASE_URL}/things?page=2&q=a+b`);
  });

  it("injects the stored access token as a bearer header", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const { client, storage } = makeClient(fetchMock);
    storage.setTokens({ accessToken: "t1", refreshToken: "r1" });

    await client.request("GET", "/things");

    expect(callOf(fetchMock).headers["Authorization"]).toBe("Bearer t1");
  });

  it("returns undefined for 204 responses", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const { client } = makeClient(fetchMock);

    await expect(client.request("DELETE", "/things/abc")).resolves.toBe(
      undefined,
    );
  });

  it("throws GridoneError with status and detail from the error body", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: "Device not found" }, 404),
    );
    const { client } = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/things/nope"));

    expect(error).toBeInstanceOf(GridoneError);
    expect((error as GridoneError).status).toBe(404);
    expect((error as GridoneError).detail).toBe("Device not found");
  });

  it("stringifies structured error details", async () => {
    const detail = [{ loc: ["body", "name"], msg: "field required" }];
    const fetchMock = vi.fn(async () => jsonResponse({ detail }, 422));
    const { client } = makeClient(fetchMock);

    const error = await rejectionOf(client.request("POST", "/things"));

    expect((error as GridoneError).detail).toBe(JSON.stringify(detail));
  });

  it("falls back to statusText for non-JSON error bodies", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("oops", { status: 500, statusText: "Internal Error" }),
    );
    const { client } = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/things"));

    expect((error as GridoneError).status).toBe(500);
    expect((error as GridoneError).detail).toBe("Internal Error");
  });

  it("wraps connection failures in NetworkError with the cause chained", async () => {
    const cause = new TypeError("fetch failed");
    const fetchMock = vi.fn(async () => {
      throw cause;
    });
    const { client } = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/things"));

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).detail).toBe("fetch failed");
    expect((error as NetworkError).cause).toBe(cause);
  });
});

describe("token refresh", () => {
  /** Fake API: /auth/token rotates tokens; anything else 401s unless sent with the rotated token. */
  function refreshingApi() {
    let refreshCalls = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/auth/token")) {
          refreshCalls += 1;
          return tokenResponse("t2", "r2");
        }
        const headers = (init?.headers ?? {}) as Record<string, string>;
        return headers["Authorization"] === "Bearer t2"
          ? jsonResponse({ ok: true })
          : jsonResponse({ detail: "Token expired" }, 401);
      },
    );
    return { fetchMock, refreshCalls: () => refreshCalls };
  }

  it("refreshes once on 401, retries with the new token and persists it", async () => {
    const { fetchMock, refreshCalls } = refreshingApi();
    const { client, storage } = makeClient(fetchMock);
    storage.setTokens({ accessToken: "t1", refreshToken: "r1" });

    const result = await client.request<{ ok: boolean }>("GET", "/things");

    expect(result).toEqual({ ok: true });
    expect(refreshCalls()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3); // original, refresh, retry
    expect(storage.getTokens()).toEqual({
      accessToken: "t2",
      refreshToken: "r2",
    });
    const refresh = callOf(fetchMock, 1);
    expect(refresh.init?.body).toBe(
      "grant_type=refresh_token&refresh_token=r1",
    );
    expect(refresh.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("shares a single refresh between concurrent 401s", async () => {
    const { fetchMock, refreshCalls } = refreshingApi();
    const { client, storage } = makeClient(fetchMock);
    storage.setTokens({ accessToken: "t1", refreshToken: "r1" });

    const results = await Promise.all([
      client.request<{ ok: boolean }>("GET", "/things"),
      client.request<{ ok: boolean }>("GET", "/other-things"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls()).toBe(1);
  });

  it("throws the original 401 and clears tokens when the refresh is rejected", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/auth/token")
        ? jsonResponse({ detail: "Invalid or expired refresh token" }, 401)
        : jsonResponse({ detail: "Token expired" }, 401),
    );
    const { client, storage } = makeClient(fetchMock);
    storage.setTokens({ accessToken: "t1", refreshToken: "r1" });

    const error = await rejectionOf(client.request("GET", "/things"));

    expect((error as GridoneError).status).toBe(401);
    expect(storage.getTokens()).toBeNull();
  });

  it("does not attempt a refresh without a stored refresh token", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: "Not authenticated" }, 401),
    );
    const { client } = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/things"));

    expect((error as GridoneError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after one retry when the new token is also rejected", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/auth/token")
        ? tokenResponse("t2", "r2")
        : jsonResponse({ detail: "Token expired" }, 401),
    );
    const { client, storage } = makeClient(fetchMock);
    storage.setTokens({ accessToken: "t1", refreshToken: "r1" });

    const error = await rejectionOf(client.request("GET", "/things"));

    expect((error as GridoneError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3); // original, refresh, retry — no loop
  });
});

describe("login", () => {
  it("posts the password grant and stores the token pair", async () => {
    const fetchMock = vi.fn(async () => tokenResponse("t1", "r1"));
    const { client, storage } = makeClient(fetchMock);

    await client.login("admin", "s3cret");

    const { url, init, headers } = callOf(fetchMock);
    expect(url).toBe(`${BASE_URL}/auth/token`);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init?.body).toBe(
      "grant_type=password&username=admin&password=s3cret",
    );
    expect(storage.getTokens()).toEqual({
      accessToken: "t1",
      refreshToken: "r1",
    });
  });

  it("throws GridoneError on bad credentials and stores nothing", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: "Invalid username or password" }, 401),
    );
    const { client, storage } = makeClient(fetchMock);

    const error = await rejectionOf(client.login("admin", "wrong"));

    expect((error as GridoneError).status).toBe(401);
    expect((error as GridoneError).detail).toBe("Invalid username or password");
    expect(storage.getTokens()).toBeNull();
  });
});

describe("logout", () => {
  it("notifies the server with auth and clears tokens", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ detail: "Logged out" }));
    const { client, storage } = makeClient(fetchMock);
    storage.setTokens({ accessToken: "t1", refreshToken: "r1" });

    await client.logout();

    const { url, headers } = callOf(fetchMock);
    expect(url).toBe(`${BASE_URL}/auth/logout`);
    expect(headers["Authorization"]).toBe("Bearer t1");
    expect(storage.getTokens()).toBeNull();
  });

  it("clears tokens even when the server is unreachable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const { client, storage } = makeClient(fetchMock);
    storage.setTokens({ accessToken: "t1", refreshToken: "r1" });

    await expect(client.logout()).resolves.toBeUndefined();
    expect(storage.getTokens()).toBeNull();
  });
});
