/**
 * The `/ws/devices` handshake and frame helpers shared by the suites that
 * open a socket. `GridoneClient` is REST-only, so a suite presents the token
 * itself, as a subprotocol offer: the only header a browser `WebSocket` can
 * set. The server answers with the plain `gridone` one.
 */

import { websocketUrl } from "./api";

export const WS_URL = websocketUrl("/ws/devices");

export function authSubprotocols(accessToken: string): string[] {
  return ["gridone", `gridone.auth.bearer.${accessToken}`];
}

/** Resolves on the open handshake, rejects on a refused or closed one. */
export function openSocket(protocols?: string[]): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL, protocols);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error(`handshake refused: ${WS_URL}`));
    socket.onclose = (event) =>
      reject(new Error(`closed before open with code ${event.code}`));
  });
}

export function nextMessageOfType(
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

/**
 * Every frame of one type the socket receives from now on, as a live array:
 * a suite reads it later to assert what did, and did not, arrive.
 */
export function collectMessagesOfType(
  socket: WebSocket,
  type: string,
): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as Record<string, unknown>;
    if (message.type === type) frames.push(message);
  };
  return frames;
}
