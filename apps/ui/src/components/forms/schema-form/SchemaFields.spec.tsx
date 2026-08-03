import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "schemaForm.addItem": "Add item",
    "schemaForm.removeItem": "Remove item {{index}}",
    "schemaForm.itemLabel": "Item {{index}}",
    "schemaForm.emptyArray": "No items yet. Add the first item.",
    "schemaForm.unsupportedField": "Unsupported field",
    "schemaForm.showSecret": "Show value",
    "schemaForm.hideSecret": "Hide value",
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
  onSubmit,
}: {
  schema: unknown;
  values?: SchemaFormValues;
  namePrefix?: string;
  overrides?: Record<string, (props: SchemaWidgetProps) => ReactElement>;
  onSubmit?: (values: SchemaFormValues) => void;
}) {
  const { form, fields } = useSchemaForm({ schema, values });
  return (
    <form onSubmit={form.handleSubmit((submitted) => onSubmit?.(submitted))}>
      <SchemaFields
        fields={fields}
        control={form.control}
        namePrefix={namePrefix}
        overrides={overrides}
      />
      {onSubmit && <button type="submit">Submit</button>}
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

  it("renders a secret-marked string masked, with a working reveal toggle", () => {
    render(
      <Harness
        schema={flatSchema({ password: { type: "string", secret: true } })}
      />,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show value" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide value" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("masks the app contract's format password through the same widget", () => {
    render(
      <Harness
        schema={flatSchema({
          api_key: { type: "string", format: "password" },
        })}
      />,
    );
    expect(screen.getByLabelText("Api Key")).toHaveAttribute(
      "type",
      "password",
    );
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

  it("KNX: tunneling_mode is a select, flat IP-Secure fields are editable", () => {
    render(<Harness schema={knxSchema} />);
    expect(
      screen.getByRole("combobox", { name: "Tunneling Mode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Secure Device Authentication Password").tagName,
    ).toBe("INPUT");
    expect(screen.getByLabelText("Secure User Password").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Secure User Id")).toHaveValue(2);
    // The whole schema is renderable — nothing falls back to the placeholder.
    expect(screen.queryByText("Unsupported field")).not.toBeInTheDocument();
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

describe("SchemaFields — arrays", () => {
  it("shows the empty state and supports adding, editing, and removing scalar rows", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <Harness
        schema={flatSchema({
          tags: { type: "array", title: "Tags", items: { type: "string" } },
        })}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByText("No items yet. Add the first item."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText(/^Item 1/), "first");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText(/^Item 2/), "second");
    await user.click(screen.getByRole("button", { name: "Remove item 1" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ tags: ["second"] }),
    );
  });

  it("renders smart-meter rows and displays validation on the item field", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        schema={flatSchema({
          meters: {
            type: "array",
            title: "Meters",
            items: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["alpha", "beta"] },
                point_id: { type: "string", minLength: 1 },
              },
              required: ["provider", "point_id"],
            },
          },
        })}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(
      screen.getByRole("combobox", { name: /Provider/ }),
    ).toBeInTheDocument();
    const pointId = screen.getByLabelText(/Point Id/);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(pointId.closest('[data-slot="field"]')).toHaveTextContent(
        /expected string/i,
      ),
    );
  });

  it("disables row actions at minItems and maxItems", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        schema={flatSchema({
          tags: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 2,
          },
        })}
        values={{ tags: ["first"] }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Remove item 1" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove item 1" })).toBeEnabled();
  });

  it("renders the unsupported placeholder for objects nested inside rows", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <Harness
        schema={flatSchema({
          groups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                metadata: { type: "object", properties: {} },
              },
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Unsupported field")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add item" }),
    ).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unsupported schema shape for field "groups"'),
      expect.anything(),
    );
  });
});
