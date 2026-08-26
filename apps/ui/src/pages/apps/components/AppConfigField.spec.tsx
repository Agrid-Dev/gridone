import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, type FieldValues } from "react-hook-form";
import type { Asset, Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import {
  normalizeProperty,
  type JsonSchemaObject,
} from "@/components/forms/schema-form";
import type { AppSchemaNode } from "@/lib/appConfigSchema";

vi.mock("react-i18next", () =>
  createI18nMock({
    "pickers.asset.placeholder": "Select locations",
    "pickers.multiSelect.placeholder": "Select values",
  }),
);

// `useQuery` is mocked outright, so `client.devices.list` (the real
// `queryFn`) never runs — `useGridoneClient` is stubbed only so the real
// hook, which needs a provider, is never reached.
const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { list: vi.fn() },
  }),
}));

const devices: Device[] = [
  {
    id: "d1",
    name: "Roof weather station",
    type: "weather_sensor",
    tags: {},
    driver_id: "drv-1",
    transport_id: "tp-1",
    config: {},
    attributes: {},
    is_faulty: false,
  },
];

const assets: Asset[] = [
  { id: "z1", type: "zone", name: "Zone 101", path: ["z1"], position: 0 },
  { id: "z2", type: "zone", name: "Zone 102", path: ["z2"], position: 1 },
];

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: assets,
    assetsById: Object.fromEntries(assets.map((a) => [a.id, a])),
    isLoading: false,
  }),
}));

// Radix/cmdk primitives inlined: jsdom cannot drive their portals and pointer
// events, and the mapping from schema to widget is what matters here.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandInput: () => null,
  CommandList: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import { AppConfigField, appConfigOverrides } from "./AppConfigField";

/** Renders one field in a bare form and exposes the value it holds. */
function Harness({
  schema,
  defaultValue,
  onValue,
  fieldError,
}: {
  schema: AppSchemaNode;
  defaultValue?: unknown;
  onValue: (value: unknown) => void;
  fieldError?: string;
}) {
  const { control, watch, setError } = useForm<FieldValues>({
    defaultValues: { field: defaultValue },
  });
  onValue(watch("field"));
  React.useEffect(() => {
    if (fieldError) setError("field", { type: "manual", message: fieldError });
  }, [fieldError, setError]);
  return (
    <AppConfigField
      name="field"
      schema={{ title: "Field", ...schema }}
      control={control}
      required={false}
    />
  );
}

function renderField(
  schema: AppSchemaNode,
  defaultValue?: unknown,
  fieldError?: string,
) {
  const values: unknown[] = [];
  render(
    <Harness
      schema={schema}
      defaultValue={defaultValue}
      fieldError={fieldError}
      onValue={(value) => values.push(value)}
    />,
  );
  return () => values[values.length - 1];
}

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
});

describe("AppConfigField widget mapping", () => {
  it("renders an array of `format: asset-id` as an asset multi-select", async () => {
    const user = userEvent.setup();
    const value = renderField(
      { type: "array", items: { type: "string", format: "asset-id" } },
      ["z1"],
    );

    await user.click(screen.getByRole("option", { name: /Zone 102/ }));

    expect(value()).toEqual(["z1", "z2"]);
  });

  it("renders a string of `format: asset-id` as a single asset select", async () => {
    const user = userEvent.setup();
    const value = renderField({ type: "string", format: "asset-id" });

    await user.selectOptions(screen.getByTestId("select"), "z2");

    expect(value()).toBe("z2");
  });

  it("renders a string of `format: device-id` as a single device select, filtered by device_type", async () => {
    mockUseQuery.mockReturnValue({ data: devices, isLoading: false });
    const user = userEvent.setup();
    const value = renderField({
      type: "string",
      format: "device-id",
      device_type: "weather_sensor",
    });

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["devices", { types: ["weather_sensor"] }],
      }),
    );

    await user.selectOptions(screen.getByTestId("select"), "d1");

    expect(value()).toBe("d1");
  });

  it("masks a `format: password` field", () => {
    renderField({ type: "string", format: "password" });

    expect(screen.getByLabelText(/Field/)).toHaveAttribute("type", "password");
  });

  it("renders an array of enum items as a multi-select over those values", async () => {
    const user = userEvent.setup();
    const value = renderField({
      type: "array",
      items: { type: "string", enum: ["comfort", "eco"] },
    });

    await user.click(screen.getByRole("option", { name: "Eco" }));

    expect(value()).toEqual(["eco"]);
  });

  it("renders a free-form array as one value per line, blanks dropped", () => {
    const value = renderField({ type: "array", items: { type: "string" } }, [
      "a",
    ]);
    const textarea = screen.getByLabelText(/Field/);

    expect(textarea).toHaveValue("a");
    fireEvent.change(textarea, { target: { value: "a\nb\n\n c " } });

    expect(value()).toEqual(["a", "b", "c"]);
  });

  it("keeps numeric list items numbers", () => {
    const value = renderField({ type: "array", items: { type: "integer" } });

    fireEvent.change(screen.getByLabelText(/Field/), {
      target: { value: "10\n20" },
    });

    expect(value()).toEqual([10, 20]);
  });

  it("surfaces a validation error on an asset field", () => {
    renderField(
      { type: "array", items: { type: "string", format: "asset-id" } },
      [],
      "Pick at least one location",
    );

    expect(screen.getByText("Pick at least one location")).toBeInTheDocument();
  });

  it("surfaces a validation error on a device field", () => {
    mockUseQuery.mockReturnValue({ data: devices, isLoading: false });

    renderField(
      { type: "string", format: "device-id" },
      undefined,
      "Pick a device",
    );

    expect(screen.getByText("Pick a device")).toBeInTheDocument();
  });

  it("delegates primitives to the shared schema field", async () => {
    const user = userEvent.setup();
    const value = renderField({ type: "integer" });

    await user.type(screen.getByLabelText(/Field/), "42");

    expect(value()).toBe(42);
    expect(screen.getByLabelText(/Field/)).toHaveAttribute("type", "number");
  });
});

const zoneOverridesSchema: AppSchemaNode = {
  type: "array",
  title: "Zone overrides",
  items: {
    type: "object",
    properties: {
      zone_id: { type: "string", format: "asset-id" },
      zone_type: { type: "string" },
      enabled: { type: "boolean", default: true },
    },
  },
};

/** The `zone_overrides` field is routed by name, not by a schema marker, so
 *  the wiring — not just the widget — needs its own coverage. */
describe("AppConfigField zone_overrides routing", () => {
  function ZoneOverridesHarness() {
    const { control } = useForm<FieldValues>({
      defaultValues: {
        piloted_zones: ["z1", "z2"],
        zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
      },
    });
    return (
      <AppConfigField
        name="zone_overrides"
        schema={zoneOverridesSchema}
        control={control}
        required={false}
      />
    );
  }

  it("renders the overrides table rather than the generic array widget", () => {
    render(<ZoneOverridesHarness />);

    // The table view is sparse and row-based; the generic array widget would
    // render a stacked card per entry instead.
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Zone 101")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=array-field-row]")).toBeNull();
  });

  it("claims the field through the schema-form override seam", () => {
    const overrides = appConfigOverrides([
      normalizeProperty(
        "zone_overrides",
        zoneOverridesSchema as JsonSchemaObject,
      ),
      normalizeProperty("poll_interval_seconds", { type: "integer" }),
    ]);

    expect(Object.keys(overrides)).toContain("zone_overrides");
    expect(Object.keys(overrides)).not.toContain("poll_interval_seconds");
  });
});
