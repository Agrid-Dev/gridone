import { afterEach, describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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
    createTransport: (...args: unknown[]) => mockCreateTransport(...args),
    updateTransport: (...args: unknown[]) => mockUpdateTransport(...args),
  };
});

vi.mock("@/api/apiError", () => ({
  isApiError: () => false,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("react-i18next", () => createI18nMock({}));

// Imports below this line must come after the vi.mock calls.
import { useTransportForm } from "./useTransportForm";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mqttSchema: TransportSchemas["mqtt"] = {
  type: "object",
  required: ["host"],
  properties: {
    host: { type: "string" },
    client_key: {
      anyOf: [{ type: "string" }, { type: "null" }],
      secret: true,
    },
    password: {
      anyOf: [{ type: "string" }, { type: "null" }],
      secret: true,
    },
  },
};

const configSchemas = {
  mqtt: mqttSchema,
} as unknown as TransportSchemas;

const existingTransport: Transport = {
  id: "t1",
  name: "Site MQTT",
  protocol: "mqtt",
  config: {
    host: "broker",
    client_key: null,
    client_key_is_set: true,
    password: null,
    password_is_set: false,
  },
  connectionState: { status: "ok" },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("useTransportForm secret handling", () => {
  it("omits an untouched, already-configured secret field from the update payload", async () => {
    mockUpdateTransport.mockResolvedValue(existingTransport);
    const { result } = renderHook(
      () => useTransportForm(configSchemas, existingTransport),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(mockUpdateTransport).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateTransport.mock.calls[0];
    expect(Object.keys(payload.config)).not.toContain("client_key");
    expect(payload.config.host).toBe("broker");
  });

  it("includes a secret field once the user reveals and replaces it", async () => {
    mockUpdateTransport.mockResolvedValue(existingTransport);
    const { result } = renderHook(
      () => useTransportForm(configSchemas, existingTransport),
      { wrapper: makeWrapper() },
    );

    act(() => {
      result.current.revealSecret("client_key");
      result.current.configFormMethods.setValue("client_key", "new-key");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(mockUpdateTransport).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateTransport.mock.calls[0];
    expect(payload.config.client_key).toBe("new-key");
  });

  it("does not omit fields when creating a new transport", async () => {
    mockCreateTransport.mockResolvedValue(existingTransport);
    const { result } = renderHook(
      () =>
        useTransportForm(configSchemas, undefined, { lockedProtocol: "mqtt" }),
      { wrapper: makeWrapper() },
    );

    act(() => {
      result.current.baseFormMethods.setValue("name", "New MQTT");
      result.current.configFormMethods.setValue("host", "broker");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(mockCreateTransport).toHaveBeenCalledTimes(1));
    const [payload] = mockCreateTransport.mock.calls[0];
    expect(payload.config.host).toBe("broker");
  });
});
