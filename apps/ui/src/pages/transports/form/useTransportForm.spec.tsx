import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createI18nMock } from "@/test/i18nMock";
import type { Transport, TransportSchemas } from "@/api/transports";

const { mockCreateTransport, mockUpdateTransport } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
  mockUpdateTransport: vi.fn(),
}));

vi.mock("@/api/transports", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/transports")>(
      "@/api/transports",
    );
  return {
    ...actual,
    createTransport: mockCreateTransport,
    updateTransport: mockUpdateTransport,
  };
});

vi.mock("@/api/apiError", () => ({ isApiError: () => false }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("react-i18next", () => createI18nMock({}));

import { useTransportForm } from "./useTransportForm";

const SCHEMAS = {
  mqtt: {
    type: "object",
    required: ["host"],
    properties: {
      host: { type: "string" },
      client_key: {
        anyOf: [{ type: "string" }, { type: "null" }],
        secret: true,
      },
    },
  },
} as unknown as TransportSchemas;

const configuredTransport: Transport = {
  id: "t1",
  name: "Broker",
  protocol: "mqtt",
  config: { host: "broker", client_key: null },
  connectionState: { status: "ok" },
  configuredSecrets: ["client_key"],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.clearAllMocks());

describe("useTransportForm secret submit filter", () => {
  it("omits a configured, untouched secret from the update payload", async () => {
    mockUpdateTransport.mockResolvedValue(configuredTransport);
    const { result } = renderHook(
      () => useTransportForm(SCHEMAS, configuredTransport),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(mockUpdateTransport).toHaveBeenCalledOnce());
    const [, payload] = mockUpdateTransport.mock.calls[0];
    expect(payload.config).not.toHaveProperty("client_key");
    expect(payload.config.host).toBe("broker");
  });

  it("sends a secret once it is revealed and typed", async () => {
    mockUpdateTransport.mockResolvedValue(configuredTransport);
    const { result } = renderHook(
      () => useTransportForm(SCHEMAS, configuredTransport),
      { wrapper },
    );

    act(() => {
      result.current.revealSecret("client_key");
      result.current.configFormMethods.setValue("client_key", "rotated");
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(mockUpdateTransport).toHaveBeenCalledOnce());
    const [, payload] = mockUpdateTransport.mock.calls[0];
    expect(payload.config.client_key).toBe("rotated");
  });

  it("omits a revealed-but-empty secret (never wipes)", async () => {
    mockUpdateTransport.mockResolvedValue(configuredTransport);
    const { result } = renderHook(
      () => useTransportForm(SCHEMAS, configuredTransport),
      { wrapper },
    );

    act(() => {
      result.current.revealSecret("client_key");
      result.current.configFormMethods.setValue("client_key", "");
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(mockUpdateTransport).toHaveBeenCalledOnce());
    const [, payload] = mockUpdateTransport.mock.calls[0];
    expect(payload.config).not.toHaveProperty("client_key");
  });

  it("on create, sends a typed secret and omits an empty one", async () => {
    mockCreateTransport.mockResolvedValue(configuredTransport);
    const { result } = renderHook(
      () => useTransportForm(SCHEMAS, undefined, { lockedProtocol: "mqtt" }),
      { wrapper },
    );

    act(() => {
      result.current.baseFormMethods.setValue("name", "New");
      result.current.configFormMethods.setValue("host", "broker");
      result.current.configFormMethods.setValue("client_key", "fresh");
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(mockCreateTransport).toHaveBeenCalledOnce());
    const [payload] = mockCreateTransport.mock.calls[0];
    expect(payload.config.client_key).toBe("fresh");
  });
});
