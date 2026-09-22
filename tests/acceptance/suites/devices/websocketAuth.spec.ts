import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeAdminClientWithToken } from "../../lib/api";
import {
  authSubprotocols,
  nextMessageOfType,
  openSocket,
} from "../../lib/websocket";

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
