import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "schemaForm.unsupportedField": "Unsupported field",
  }),
);

// Imported after the mocks are registered.
import { SchemaFields, type SchemaWidgetProps } from "./SchemaFields";
import { useSchemaForm, type SchemaFormValues } from "./useSchemaForm";
import knxSchema from "./__fixtures__/transport-knx.json";
import mqttSchema from "./__fixtures__/transport-mqtt.json";

/** Renders `SchemaFields` exactly as consumers embed it: descriptors and
 *  control both coming from `useSchemaForm`. */
function Harness({
  schema,
  values,
  namePrefix,
  overrides,
}: {
  schema: unknown;
  values?: SchemaFormValues;
  namePrefix?: string;
  overrides?: Record<string, (props: SchemaWidgetProps) => ReactElement>;
}) {
  const { form, fields } = useSchemaForm({ schema, values });
  return (
    <form>
      <SchemaFields
        fields={fields}
        control={form.control}
        namePrefix={namePrefix}
        overrides={overrides}
      />
    </form>
  );
}

const flatSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", properties, required });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SchemaFields — one widget per kind", () => {
  it("renders a string property as a text input", () => {
    render(<Harness schema={flatSchema({ host: { type: "string" } })} />);
    const input = screen.getByLabelText("Host");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
  });

  it("renders a multiline string property as a textarea", () => {
    render(
      <Harness
        schema={flatSchema({ cert: { type: "string", multiline: true } })}
      />,
    );
    expect(screen.getByLabelText("Cert").tagName).toBe("TEXTAREA");
  });

  it("renders integer and number properties as number inputs", () => {
    render(
      <Harness
        schema={flatSchema({
          port: { type: "integer" },
          ratio: { type: "number" },
        })}
      />,
    );
    expect(screen.getByLabelText("Port")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Ratio")).toHaveAttribute("type", "number");
  });

  it("renders a boolean property as a switch", () => {
    render(<Harness schema={flatSchema({ tls: { type: "boolean" } })} />);
    expect(screen.getByRole("switch", { name: "Tls" })).toBeInTheDocument();
  });

  it("renders an enum property as a select", () => {
    render(
      <Harness
        schema={flatSchema({
          mode: { type: "string", enum: ["udp", "tcp"] },
        })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Mode" })).toBeInTheDocument();
  });

  it("renders an explicit placeholder for unsupported shapes and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <Harness
        schema={flatSchema({
          nested: { type: "object", properties: {} },
        })}
      />,
    );
    expect(screen.getByText("Nested")).toBeInTheDocument();
    expect(screen.getByText("Unsupported field")).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unsupported schema shape for field "nested"'),
      expect.anything(),
    );
  });
});

describe("SchemaFields — real transport schemas (parity checks)", () => {
  it("MQTT: tls switches, PEM textareas, defaults seeded as values", () => {
    render(<Harness schema={mqttSchema} />);
    expect(screen.getByRole("switch", { name: "Tls" })).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Tls Insecure" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ca Cert").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Client Key").tagName).toBe("TEXTAREA");
    // Schema defaults are actual form values now, not placeholders.
    expect(screen.getByLabelText("Port")).toHaveValue(1883);
  });

  it("KNX: tunneling_mode is a select, secure_credentials an explicit placeholder", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<Harness schema={knxSchema} />);
    expect(
      screen.getByRole("combobox", { name: "Tunneling Mode" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Secure Credentials")).toBeInTheDocument();
    expect(screen.getByText("Unsupported field")).toBeInTheDocument();
  });

  it("merges entity values over schema defaults on edit", () => {
    render(
      <Harness schema={mqttSchema} values={{ host: "broker", port: 8883 }} />,
    );
    // `host` is required, so its accessible label carries the asterisk.
    expect(screen.getByLabelText(/^Host/)).toHaveValue("broker");
    expect(screen.getByLabelText("Port")).toHaveValue(8883);
  });
});

describe("SchemaFields — composition", () => {
  it("prefixes field names for consumers registering under a sub-path", () => {
    render(
      <Harness
        schema={flatSchema({ host: { type: "string" } })}
        namePrefix="config."
      />,
    );
    // FieldShell wires label→input through id = the RHF field path.
    expect(screen.getByLabelText("Host")).toHaveAttribute("id", "config.host");
  });

  it("uses a per-consumer widget override instead of the registry", () => {
    render(
      <Harness
        schema={flatSchema({ zone: { type: "string" } })}
        overrides={{
          zone: ({ name }: SchemaWidgetProps) => (
            <div data-testid="custom-widget">{name}</div>
          ),
        }}
      />,
    );
    expect(screen.getByTestId("custom-widget")).toHaveTextContent("zone");
    expect(screen.queryByLabelText("Zone")).not.toBeInTheDocument();
  });
});
