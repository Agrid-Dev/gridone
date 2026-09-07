import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeAdminClientWithToken, websocketUrl } from "../../lib/api";

const WS_URL = websocketUrl("/ws/devices");

/**
 * The token rides in a subprotocol offer because that is the only header a
 * browser `WebSocket` can set; the server answers with the plain `gridone` one.
 */
function authSubprotocols(accessToken: string): string[] {
  return ["gridone", `gridone.auth.bearer.${accessToken}`];
}

/** Resolves on the open handshake, rejects on a refused or closed one. */
function openSocket(protocols?: string[]): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL, protocols);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error(`handshake refused: ${WS_URL}`));
    socket.onclose = (event) =>
      reject(new Error(`closed before open with code ${event.code}`));
  });
}

function nextMessageOfType(
  socket: WebSocket,
  type: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no "${type}" frame within ${timeoutMs}ms`)),
      timeoutMs,
    );
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (message.type !== type) return;
      clearTimeout(timer);
      resolve(message);
    };
  });
}

describe("Telemetry socket authentication", () => {
  let accessToken: string;
  let socket: WebSocket | null = null;

  beforeAll(async () => {
    ({ accessToken } = await makeAdminClientWithToken());
  });

  afterEach(() => {
    socket?.close();
    socket = null;
  });

  it("refuses a handshake carrying no credential", async () => {
    await expect(openSocket()).rejects.toThrow();
  });

  it("refuses a handshake carrying a token it did not mint", async () => {
    await expect(openSocket(authSubprotocols("not-a-jwt"))).rejects.toThrow();
  });

  it("accepts a logged-in token and answers on the open socket", async () => {
    socket = await openSocket(authSubprotocols(accessToken));

    // The negotiated value is the plain one: the token is never echoed back.
    expect(socket.protocol).toBe("gridone");

    const pong = nextMessageOfType(socket, "pong", 5_000);
    socket.send(JSON.stringify({ type: "ping" }));
    await expect(pong).resolves.toMatchObject({ type: "pong" });
  });
});
