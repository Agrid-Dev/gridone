import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createI18nMock } from "@/test/i18nMock";
import type { TransportSchemas } from "@/api/transports";

const { mockGetTransportSchemas, mockCreateTransport, mockUpdateTransport } =
  vi.hoisted(() => ({
    mockGetTransportSchemas: vi.fn(),
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
    getTransportSchemas: mockGetTransportSchemas,
    createTransport: mockCreateTransport,
    updateTransport: mockUpdateTransport,
  };
});

vi.mock("react-i18next", () => createI18nMock({}));

// Import after the mocks above are registered.
import TransportForm from "./index";

const CONFIG_SCHEMAS: TransportSchemas = {
  mqtt: {
    type: "object",
    required: ["host"],
    properties: {
      host: { type: "string" },
      ca_cert: { type: "string", multiline: true },
    },
  },
  http: { type: "object", properties: {} },
  "modbus-tcp": { type: "object", properties: {} },
  bacnet: { type: "object", properties: {} },
} as unknown as TransportSchemas;

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return render(<TransportForm lockedProtocol="mqtt" />, { wrapper: Wrapper });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TransportForm — PEM multiline fields", () => {
  it("renders a multiline schema field as a textarea, not a single-line input", async () => {
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    renderForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/ca cert/i).tagName).toBe("TEXTAREA");
    });
    expect(screen.getByLabelText(/host/i).tagName).toBe("INPUT");
  });

  it("preserves newlines pasted into the multiline field (proves the PEM-paste fix)", async () => {
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    renderForm();

    const textarea = await screen.findByLabelText(/ca cert/i);
    const pem =
      "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----";
    fireEvent.change(textarea, { target: { value: pem } });

    expect((textarea as HTMLTextAreaElement).value).toBe(pem);
    expect((textarea as HTMLTextAreaElement).value.split("\n")).toHaveLength(3);
  });

  it("a plain (non-multiline) field is a single-line input that cannot hold newlines", async () => {
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    renderForm();

    const hostInput = await screen.findByLabelText(/host/i);
    fireEvent.change(hostInput, { target: { value: "line1\nline2" } });

    // This is the bug the multiline flag fixes: a single-line <input>'s value
    // sanitization (HTML spec) strips embedded newlines outright.
    expect((hostInput as HTMLInputElement).value).not.toContain("\n");
  });
});
