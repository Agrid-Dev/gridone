import { describe, expect, it, vi } from "vitest";

import { GridoneError, NetworkError } from "../errors";
import { HttpClient } from "./httpClient";
import { MemoryTokenStorage } from "./tokenStorage";

const BASE_URL = "http://api.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(fetchMock: typeof globalThis.fetch): HttpClient {
  return new HttpClient({
    baseUrl: BASE_URL,
    tokenStorage: new MemoryTokenStorage(),
    fetch: fetchMock,
  });
}

async function rejectionOf(promise: Promise<unknown>): Promise<GridoneError> {
  return promise.then(
    () => {
      throw new Error("expected promise to reject");
    },
    (error: unknown) => error as GridoneError,
  );
}

describe("error conversion", () => {
  it("carries a string detail through untouched", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: "Transport not found" }, 404),
    );
    const client = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/transports/nope"));

    expect(error).toBeInstanceOf(GridoneError);
    expect(error.status).toBe(404);
    expect(error.detail).toBe("Transport not found");
    expect(error.rawDetail).toBe("Transport not found");
    expect(error.validationErrors).toBeUndefined();
  });

  it("parses a well-formed 422 array into validationErrors", async () => {
    const detail = [
      {
        loc: ["body", "mqtt", "config", "host"],
        msg: "Field required",
        type: "missing",
      },
      {
        loc: ["body", "device_id"],
        msg: "Extra inputs are not permitted",
        type: "extra_forbidden",
      },
    ];
    const fetchMock = vi.fn(async () => jsonResponse({ detail }, 422));
    const client = makeClient(fetchMock);

    const error = await rejectionOf(client.request("POST", "/transports/"));

    expect(error.status).toBe(422);
    expect(error.validationErrors).toEqual(detail);
    expect(error.rawDetail).toEqual(detail);
    // Back-compat: `detail` stays a string even for structured bodies.
    expect(error.detail).toBe(JSON.stringify(detail));
  });

  it("keeps a malformed validation array as a stringified detail only", async () => {
    const detail = [{ loc: ["body", "name"], msg: "field required" }];
    const fetchMock = vi.fn(async () => jsonResponse({ detail }, 422));
    const client = makeClient(fetchMock);

    const error = await rejectionOf(client.request("POST", "/transports/"));

    expect(error.validationErrors).toBeUndefined();
    expect(error.detail).toBe(JSON.stringify(detail));
  });

  it("falls back to statusText when the body is not JSON", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<html>oops</html>", {
          status: 500,
          statusText: "Internal Error",
        }),
    );
    const client = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/things"));

    expect(error.status).toBe(500);
    expect(error.detail).toBe("Internal Error");
    expect(error.validationErrors).toBeUndefined();
  });

  it("falls back to statusText when the JSON body has no detail key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "nope" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/things"));

    expect(error.detail).toBe("Bad Request");
  });

  it("wraps connection failures in NetworkError with the cause chained", async () => {
    const cause = new TypeError("fetch failed");
    const fetchMock = vi.fn(async () => {
      throw cause;
    });
    const client = makeClient(fetchMock);

    const error = await rejectionOf(client.request("GET", "/things"));

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.status).toBe(0);
    expect(error.detail).toBe("fetch failed");
    expect(error.cause).toBe(cause);
    expect(error.validationErrors).toBeUndefined();
  });
});
