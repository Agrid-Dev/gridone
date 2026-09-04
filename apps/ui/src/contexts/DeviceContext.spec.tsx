import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GridoneClient, MeResponse } from "@gridone/sdk";

import { GridoneClientProvider } from "./GridoneClientContext";
import { AuthProvider } from "./AuthContext";
import { DeviceProvider, useDeviceContext } from "./DeviceContext";

/** jsdom ships no WebSocket, so every spec here drives this one. */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readyState = 0;

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    MockWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const ME: MeResponse = {
  id: "user-1",
  username: "admin",
  role: "admin",
  permissions: [],
} as unknown as MeResponse;

function setTokens(accessToken: string): void {
  document.cookie = `gridone_access_token=${accessToken}; Path=/`;
  document.cookie = "gridone_refresh_token=refresh; Path=/";
}

function clearTokens(): void {
  document.cookie = "gridone_access_token=; Path=/; Max-Age=0";
  document.cookie = "gridone_refresh_token=; Path=/; Max-Age=0";
}

function makeClient(me: () => Promise<MeResponse>): GridoneClient {
  return {
    me: vi.fn(me),
    login: vi.fn(),
    logout: vi.fn(),
    health: vi.fn(() => Promise.resolve({ version: "test", flags: [] })),
  } as unknown as GridoneClient;
}

function StatusProbe() {
  const { status } = useDeviceContext();
  return <span data-testid="status">{status}</span>;
}

function renderProvider(client: GridoneClient): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GridoneClientProvider client={client}>
        <AuthProvider>
          <DeviceProvider>
            <StatusProbe />
          </DeviceProvider>
        </AuthProvider>
      </GridoneClientProvider>
    </QueryClientProvider>,
  );
}

describe("DeviceProvider socket authentication", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    clearTokens();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens no socket while the session is unauthenticated", async () => {
    const client = makeClient(() => Promise.reject(new Error("401")));
    renderProvider(client);

    // Wait for the session restore to fail before concluding nothing connected.
    await waitFor(() => expect(client.me).toHaveBeenCalled());
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("offers the access token as a subprotocol once authenticated", async () => {
    setTokens("token-a");
    renderProvider(makeClient(() => Promise.resolve(ME)));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    expect(MockWebSocket.instances[0].protocols).toEqual([
      "gridone",
      "gridone.auth.bearer.token-a",
    ]);
    expect(screen.getByTestId("status")).toHaveTextContent("connecting");
  });

  it("renews the token before reconnecting after the server closes it", async () => {
    setTokens("token-a");
    // The server closes an expired socket; `/auth/me` drives the SDK refresh,
    // which writes the new token the reconnect must pick up.
    const client = makeClient(() => {
      setTokens("token-b");
      return Promise.resolve(ME);
    });
    renderProvider(client);
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    vi.useFakeTimers();
    MockWebSocket.instances[0].close();
    await vi.advanceTimersByTimeAsync(1000);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1].protocols).toEqual([
      "gridone",
      "gridone.auth.bearer.token-b",
    ]);
  });
});
