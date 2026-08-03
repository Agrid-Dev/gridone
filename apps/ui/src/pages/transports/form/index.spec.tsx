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
import { GridoneError, type Transport } from "@gridone/sdk";
import type { TransportSchemas } from "./useTransportForm";

const {
  mockGetTransportSchemas,
  mockCreateTransport,
  mockUpdateTransport,
  mockToastError,
} = vi.hoisted(() => ({
  mockGetTransportSchemas: vi.fn(),
  mockCreateTransport: vi.fn(),
  mockUpdateTransport: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    transports: {
      getSchemas: mockGetTransportSchemas,
      create: mockCreateTransport,
      update: mockUpdateTransport,
    },
  }),
}));

vi.mock("react-i18next", () => createI18nMock({}));

// Import after the mocks above are registered.
import TransportForm from "./index";
import realMqttSchema from "@/components/forms/schema-form/__fixtures__/transport-mqtt.json";
import realKnxSchema from "@/components/forms/schema-form/__fixtures__/transport-knx.json";
import type { FormProtocol } from "./useTransportForm";

const CONFIG_SCHEMAS: TransportSchemas = {
  mqtt: {
    type: "object",
    required: ["host"],
    properties: {
      host: { type: "string" },
      port: { type: "integer", default: 1883 },
      ca_cert: { type: "string", multiline: true },
    },
  },
  http: { type: "object", properties: {} },
  "modbus-tcp": { type: "object", properties: {} },
  bacnet: { type: "object", properties: {} },
  knx: realKnxSchema,
} as unknown as TransportSchemas;

function renderForm(
  lockedProtocol: FormProtocol = "mqtt",
  transport?: Transport,
) {
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
  return render(
    <TransportForm lockedProtocol={lockedProtocol} transport={transport} />,
    { wrapper: Wrapper },
  );
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

describe("TransportForm — schema-driven config (AGR-919)", () => {
  const schemasWithRealMqtt = {
    ...CONFIG_SCHEMAS,
    mqtt: realMqttSchema,
  } as unknown as TransportSchemas;

  it("renders boolean config fields as switches (real MQTT schema)", async () => {
    mockGetTransportSchemas.mockResolvedValue(schemasWithRealMqtt);
    renderForm();

    expect(
      await screen.findByRole("switch", { name: /^tls$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /tls insecure/i }),
    ).toBeInTheDocument();
  });

  it("seeds schema defaults as actual values and submits them explicitly", async () => {
    mockGetTransportSchemas.mockResolvedValue(schemasWithRealMqtt);
    mockCreateTransport.mockResolvedValue({ id: "t1" });
    const { container } = renderForm();

    // Defaults are real form values now, not input placeholders.
    expect(await screen.findByLabelText("Port")).toHaveValue(1883);

    // The i18n mock leaves the base field label as its raw key; the real MQTT
    // schema also has a `Username` field, so /name/i would be ambiguous.
    fireEvent.change(screen.getByLabelText(/fields\.name/), {
      target: { value: "My broker" },
    });
    fireEvent.change(screen.getByLabelText(/^host/i), {
      target: { value: "broker.local" },
    });
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => expect(mockCreateTransport).toHaveBeenCalled());
    expect(mockCreateTransport.mock.calls[0][0].config).toMatchObject({
      host: "broker.local",
      port: 1883,
      tls: false,
      tls_insecure: false,
    });
  });
});

describe("TransportForm — KNX flat IP-Secure fields (AGR-920)", () => {
  it("renders the flat secure fields with the schema defaults seeded", async () => {
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    renderForm("knx");

    expect(
      await screen.findByLabelText(/secure device authentication password/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/secure user password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/secure user id/i)).toHaveValue(2);
    expect(screen.getByLabelText(/port/i)).toHaveValue(3671);
  });

  it("creates an IP-Secure KNX transport entirely from the form", async () => {
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    mockCreateTransport.mockResolvedValue({ id: "t1" });
    const { container } = renderForm("knx");

    fireEvent.change(await screen.findByLabelText(/fields\.name/), {
      target: { value: "KNX gateway" },
    });
    fireEvent.change(screen.getByLabelText(/gateway ip/i), {
      target: { value: "gw.local" },
    });
    fireEvent.change(
      screen.getByLabelText(/secure device authentication password/i),
      { target: { value: "dev-pass" } },
    );
    fireEvent.change(screen.getByLabelText(/secure user password/i), {
      target: { value: "user-pass" },
    });
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => expect(mockCreateTransport).toHaveBeenCalled());
    expect(mockCreateTransport.mock.calls[0][0]).toMatchObject({
      protocol: "knx",
      config: {
        gateway_ip: "gw.local",
        port: 3671,
        tunneling_mode: "udp",
        secure_device_authentication_password: "dev-pass",
        secure_user_password: "user-pass",
        secure_user_id: 2,
      },
    });
  });
});

describe("TransportForm — server errors (ADR 0002)", () => {
  async function submitFilledForm() {
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    const { container } = renderForm();

    const hostInput = await screen.findByLabelText(/host/i);
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "My broker" },
    });
    fireEvent.change(hostInput, { target: { value: "broker.local" } });
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);
  }

  it("maps a 422 validation array onto the matching config field", async () => {
    mockCreateTransport.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["body", "mqtt", "config", "host"],
          msg: "Host is unreachable",
          type: "value_error",
        },
      ]),
    );

    await submitFilledForm();

    expect(await screen.findByText("Host is unreachable")).toBeInTheDocument();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("maps update errors whose loc is relative to the config model", async () => {
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    mockUpdateTransport.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["port"],
          msg: "Input should be greater than 0",
          type: "greater_than",
        },
      ]),
    );
    const { container } = renderForm("mqtt", {
      id: "mqtt-1",
      name: "My broker",
      protocol: "mqtt",
      config: { host: "broker.local", port: 1883 },
    } as Transport);

    expect(await screen.findByLabelText(/host/i)).toHaveValue("broker.local");
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    expect(
      await screen.findByText("Input should be greater than 0"),
    ).toBeInTheDocument();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("shows model-validator errors in the form-level banner", async () => {
    mockCreateTransport.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["body", "mqtt", "config"],
          msg: "client_cert and client_key must be provided together",
          type: "value_error",
        },
      ]),
    );

    await submitFilledForm();

    expect(
      await screen.findByText(
        "client_cert and client_key must be provided together",
      ),
    ).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith("saveFailed");
  });

  it("shows KNX password-pair errors in the form-level banner on edit", async () => {
    // The exact message + empty loc the API emits since the PATCH handler
    // sanitizes model-validator errors (T1): asserting the production wording
    // keeps this spec honest about what users actually read.
    const pairMessage =
      "secure_device_authentication_password and secure_user_password " +
      "must be set together to enable KNX IP-Secure";
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    mockUpdateTransport.mockRejectedValue(
      new GridoneError(422, [
        { loc: [], msg: pairMessage, type: "value_error" },
      ]),
    );
    const { container } = renderForm("knx", {
      id: "knx-1",
      name: "KNX gateway",
      protocol: "knx",
      config: { gateway_ip: "gw.local" },
    } as Transport);

    expect(await screen.findByLabelText(/gateway ip/i)).toHaveValue("gw.local");
    fireEvent.change(screen.getByLabelText(/secure user password/i), {
      target: { value: "user-pass" },
    });
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    expect(await screen.findByText(pairMessage)).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith("saveFailed");
  });

  it("submits cleared secure passwords as null, never empty strings", async () => {
    // Typed-then-cleared inputs hold "" — the wire payload must carry null so
    // the backend unsets them ("" used to enable IP-Secure with blank
    // credentials, and an absent key would keep the old value on PATCH).
    mockGetTransportSchemas.mockResolvedValue(CONFIG_SCHEMAS);
    mockCreateTransport.mockResolvedValue({ id: "t1" });
    const { container } = renderForm("knx");

    fireEvent.change(await screen.findByLabelText(/fields\.name/), {
      target: { value: "KNX gateway" },
    });
    fireEvent.change(screen.getByLabelText(/gateway ip/i), {
      target: { value: "gw.local" },
    });
    for (const label of [
      /secure device authentication password/i,
      /secure user password/i,
    ]) {
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: "secret" },
      });
      fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    }
    const form = container.querySelector("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);

    await waitFor(() => expect(mockCreateTransport).toHaveBeenCalled());
    expect(mockCreateTransport.mock.calls[0][0].config).toMatchObject({
      gateway_ip: "gw.local",
      secure_device_authentication_password: null,
      secure_user_password: null,
    });
  });

  it("maps a base-field validation error onto the name field", async () => {
    mockCreateTransport.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["body", "mqtt", "name"],
          msg: "Name is too long",
          type: "string_too_long",
        },
      ]),
    );

    await submitFilledForm();

    expect(await screen.findByText("Name is too long")).toBeInTheDocument();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("toasts the domain message for a string-detail error", async () => {
    mockCreateTransport.mockRejectedValue(
      new GridoneError(409, "A transport with this name already exists"),
    );

    await submitFilledForm();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "saveFailed: A transport with this name already exists",
      ),
    );
    expect(
      screen.getByText("A transport with this name already exists"),
    ).toBeInTheDocument();
  });

  it("shows orphaned field errors in the banner and fallback toast", async () => {
    mockCreateTransport.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["body", "mqtt", "device_id"],
          msg: "Extra inputs are not permitted",
          type: "extra_forbidden",
        },
      ]),
    );

    await submitFilledForm();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("saveFailed"),
    );
    expect(
      screen.getByText("Extra inputs are not permitted"),
    ).toBeInTheDocument();
  });
});
