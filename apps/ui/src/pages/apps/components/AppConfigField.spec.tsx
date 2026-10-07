import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    "config.image.choose": "Choose an image",
    "config.image.replace": "Change the image",
    "config.image.remove": "Remove the image",
    "config.image.preview": "Preview of the chosen image",
    "config.image.tooLarge": "This image is too large: {{size}} KB at most.",
    "config.image.wrongType": "This file is not in {{format}} format.",
    "config.image.unreadable": "This file cannot be read as an image.",
  }),
);

// jsdom cannot decode images: `createImageBitmap` does not exist there.
const { mockCreateImageBitmap } = vi.hoisted(() => ({
  mockCreateImageBitmap: vi.fn(),
}));
vi.stubGlobal("createImageBitmap", mockCreateImageBitmap);

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
  required = false,
}: {
  schema: AppSchemaNode;
  defaultValue?: unknown;
  onValue: (value: unknown) => void;
  fieldError?: string;
  required?: boolean;
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
      required={required}
    />
  );
}

function renderField(
  schema: AppSchemaNode,
  defaultValue?: unknown,
  fieldError?: string,
  required?: boolean,
) {
  const values: unknown[] = [];
  render(
    <Harness
      schema={schema}
      defaultValue={defaultValue}
      fieldError={fieldError}
      required={required}
      onValue={(value) => values.push(value)}
    />,
  );
  return () => values[values.length - 1];
}

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockCreateImageBitmap.mockReset();
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

const imageSchema: AppSchemaNode = {
  type: "string",
  contentMediaType: "image/png",
  contentEncoding: "base64",
  maxLength: 699052,
};

/** The PNG signature, which a file must start with to pass for a PNG (its
 *  decoding is stubbed); base64 "iVBORw0KGgo=". */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_BASE64 = "iVBORw0KGgo=";

/** A PNG file of `size` bytes: the signature, then zeros. */
const pngFile = (size = PNG_SIGNATURE.length) => {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_SIGNATURE.slice(0, size));
  return new File([bytes], "logo.png", { type: "image/png" });
};

/** The JPEG signature and a byte, base64 "/9j/4A==". */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const JPEG_BASE64 = "/9j/4A==";

describe("AppConfigField image field", () => {
  beforeEach(() => {
    mockCreateImageBitmap.mockResolvedValue({ close: vi.fn() });
  });

  it("offers to choose a file of the declared media type", () => {
    renderField(imageSchema);

    expect(screen.getByLabelText(/Field/)).toHaveAttribute(
      "accept",
      "image/png",
    );
    expect(
      screen.getByRole("button", { name: "Choose an image" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("holds the raw base64 of the chosen file, and previews it", async () => {
    const user = userEvent.setup();
    const value = renderField(imageSchema);

    await user.upload(screen.getByLabelText(/Field/), pngFile());

    await waitFor(() => expect(value()).toBe(PNG_BASE64));
    expect(mockCreateImageBitmap).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("img", { name: "Preview of the chosen image" }),
    ).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
    expect(
      screen.getByRole("button", { name: "Change the image" }),
    ).toBeInTheDocument();
  });

  it("previews and filters with the media type the schema declares", async () => {
    const user = userEvent.setup();
    const value = renderField({
      ...imageSchema,
      contentMediaType: "image/jpeg",
    });
    const input = screen.getByLabelText(/Field/);

    expect(input).toHaveAttribute("accept", "image/jpeg");
    await user.upload(
      input,
      new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" }),
    );

    await waitFor(() => expect(value()).toBe(JPEG_BASE64));
    expect(
      screen.getByRole("img", { name: "Preview of the chosen image" }),
    ).toHaveAttribute("src", `data:image/jpeg;base64,${JPEG_BASE64}`);
  });

  it("refuses a file over the cap before decoding it", async () => {
    const user = userEvent.setup();
    const value = renderField(imageSchema);

    // 699052 base64 characters hold 524289 bytes; one more is too many.
    await user.upload(screen.getByLabelText(/Field/), pngFile(524290));

    expect(
      await screen.findByText("This image is too large: 512 KB at most."),
    ).toBeInTheDocument();
    expect(mockCreateImageBitmap).not.toHaveBeenCalled();
    expect(value()).toBeUndefined();
  });

  it("accepts a file whose base64 fills the cap exactly", async () => {
    const user = userEvent.setup();
    // 12 characters hold 9 bytes of base64.
    const value = renderField({ ...imageSchema, maxLength: 12 });

    await user.upload(screen.getByLabelText(/Field/), pngFile(9));

    await waitFor(() => expect(value()).toBe("iVBORw0KGgoA"));
    expect(screen.queryByText(/too large/)).not.toBeInTheDocument();
  });

  it("accepts a large file when the field declares no maxLength", async () => {
    const user = userEvent.setup();
    const value = renderField({ ...imageSchema, maxLength: undefined });

    await user.upload(screen.getByLabelText(/Field/), pngFile(3 * 1024 * 1024));

    await waitFor(() => expect(typeof value()).toBe("string"));
    expect((value() as string).length).toBe(4 * 1024 * 1024);
    expect(screen.queryByText(/too large/)).not.toBeInTheDocument();
  });

  it("refuses a file of another media type than the declared one", async () => {
    // `accept` is only a hint: a file dialog also offers "All files".
    const user = userEvent.setup({ applyAccept: false });
    const value = renderField(imageSchema);

    await user.upload(
      screen.getByLabelText(/Field/),
      new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This file is not in PNG format.",
    );
    expect(mockCreateImageBitmap).not.toHaveBeenCalled();
    expect(value()).toBeUndefined();
  });

  it("refuses a file whose bytes belie its declared type", async () => {
    const user = userEvent.setup();
    const value = renderField(imageSchema);

    // A JPEG renamed `logo.png`: the browser types it by its extension.
    await user.upload(
      screen.getByLabelText(/Field/),
      new File([JPEG_BYTES], "logo.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("This file is not in PNG format."),
    ).toBeInTheDocument();
    expect(mockCreateImageBitmap).not.toHaveBeenCalled();
    expect(value()).toBeUndefined();
  });

  it("refuses a file the browser cannot decode as an image", async () => {
    mockCreateImageBitmap.mockRejectedValue(
      new DOMException("The source image could not be decoded."),
    );
    const user = userEvent.setup();
    const value = renderField(imageSchema);

    await user.upload(screen.getByLabelText(/Field/), pngFile());

    expect(
      await screen.findByText("This file cannot be read as an image."),
    ).toBeInTheDocument();
    expect(value()).toBeUndefined();
  });

  it("drops a refusal once a valid file is chosen", async () => {
    const user = userEvent.setup();
    const value = renderField({ ...imageSchema, maxLength: 12 });
    const input = screen.getByLabelText(/Field/);

    await user.upload(input, pngFile(10));
    expect(await screen.findByText(/too large/)).toBeInTheDocument();

    await user.upload(input, pngFile());

    await waitFor(() => expect(value()).toBe(PNG_BASE64));
    expect(screen.queryByText(/too large/)).not.toBeInTheDocument();
  });

  it("keeps the stored image when a replacement is refused", async () => {
    const user = userEvent.setup();
    const value = renderField({ ...imageSchema, maxLength: 8 }, PNG_BASE64);

    await user.upload(screen.getByLabelText(/Field/), pngFile(7));

    expect(await screen.findByText(/too large/)).toBeInTheDocument();
    expect(value()).toBe(PNG_BASE64);
    expect(
      screen.getByRole("img", { name: "Preview of the chosen image" }),
    ).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
  });

  it("previews the stored image, and removes it", async () => {
    const user = userEvent.setup();
    const value = renderField(imageSchema, PNG_BASE64);

    expect(
      screen.getByRole("img", { name: "Preview of the chosen image" }),
    ).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);

    await user.click(screen.getByRole("button", { name: "Remove the image" }));

    // Not `undefined`: the controller would fall back to the stored image.
    expect(value()).toBe("");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose an image" }),
    ).toBeInTheDocument();
  });

  it("offers a required image a replacement, never a removal", () => {
    // Removed, it would leave the payload without a required key.
    renderField(imageSchema, PNG_BASE64, undefined, true);

    expect(
      screen.getByRole("button", { name: "Change the image" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove the image" }),
    ).not.toBeInTheDocument();
  });

  it("drops a pending refusal when the image is removed", async () => {
    const user = userEvent.setup();
    const value = renderField({ ...imageSchema, maxLength: 8 }, PNG_BASE64);

    await user.upload(screen.getByLabelText(/Field/), pngFile(7));
    expect(await screen.findByText(/too large/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove the image" }));

    expect(value()).toBe("");
    expect(screen.queryByText(/too large/)).not.toBeInTheDocument();
  });

  it("takes the same file again after it was removed", async () => {
    const user = userEvent.setup();
    const value = renderField(imageSchema);
    const input = screen.getByLabelText(/Field/);
    const file = pngFile();

    await user.upload(input, file);
    await waitFor(() => expect(value()).toBe(PNG_BASE64));
    await user.click(screen.getByRole("button", { name: "Remove the image" }));
    expect(value()).toBe("");

    // A browser fires no `change` for a re-selected identical file unless the
    // input was cleared; user-event reproduces that rule.
    await user.upload(input, file);

    await waitFor(() => expect(value()).toBe(PNG_BASE64));
  });

  it("keeps the last chosen file when an earlier one finishes decoding later", async () => {
    let releaseFirst: () => void = () => {};
    mockCreateImageBitmap
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve({ close: vi.fn() });
          }),
      )
      .mockResolvedValue({ close: vi.fn() });
    const user = userEvent.setup();
    const value = renderField(imageSchema);
    const input = screen.getByLabelText(/Field/);

    await user.upload(input, pngFile()); // decode pending
    await user.upload(input, pngFile(9)); // decodes at once
    await waitFor(() => expect(value()).toBe("iVBORw0KGgoA"));

    await React.act(async () => releaseFirst());
    // Give the late decode every chance to land.
    await waitFor(() => expect(value()).toBe(PNG_BASE64), {
      timeout: 500,
    }).catch(() => undefined);

    expect(value()).toBe("iVBORw0KGgoA");
  });

  it("does not undo a removal with a file still being decoded", async () => {
    let release: () => void = () => {};
    mockCreateImageBitmap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ close: vi.fn() });
        }),
    );
    const user = userEvent.setup();
    const value = renderField(imageSchema, PNG_BASE64);

    await user.upload(screen.getByLabelText(/Field/), pngFile(9));
    await user.click(screen.getByRole("button", { name: "Remove the image" }));
    expect(value()).toBe("");

    await React.act(async () => release());
    await waitFor(() => expect(value()).toBe("iVBORw0KGgoA"), {
      timeout: 500,
    }).catch(() => undefined);

    expect(value()).toBe("");
  });

  it("surfaces a validation error on an image field", () => {
    renderField(imageSchema, undefined, "A logo is required");

    expect(screen.getByText("A logo is required")).toBeInTheDocument();
  });
});

const svgSchema: AppSchemaNode = {
  ...imageSchema,
  contentMediaType: "image/svg+xml",
};
const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const svgFile = () =>
  new File([SVG_TEXT], "logo.svg", { type: "image/svg+xml" });

/** `createImageBitmap` rejects every SVG, so an `<img>` element decodes it —
 *  a method jsdom lacks, stubbed here. */
describe("AppConfigField SVG image field", () => {
  const mockDecode = vi.fn();

  beforeEach(() => {
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: mockDecode,
    });
  });
  afterEach(() => {
    delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    mockDecode.mockReset();
  });

  it("takes an SVG an image element decodes", async () => {
    mockDecode.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const value = renderField(svgSchema);

    await user.upload(screen.getByLabelText(/Field/), svgFile());

    await waitFor(() => expect(value()).toBe(btoa(SVG_TEXT)));
    expect(mockDecode).toHaveBeenCalledTimes(1);
    expect(mockCreateImageBitmap).not.toHaveBeenCalled();
    expect(
      screen.getByRole("img", { name: "Preview of the chosen image" }),
    ).toHaveAttribute("src", `data:image/svg+xml;base64,${btoa(SVG_TEXT)}`);
  });

  it("refuses a file typed as another format, which no signature vouches for", async () => {
    // SVG has no signature to check: the file's type alone decides.
    mockDecode.mockResolvedValue(undefined);
    const user = userEvent.setup({ applyAccept: false });
    const value = renderField(svgSchema);

    await user.upload(screen.getByLabelText(/Field/), pngFile());

    expect(
      await screen.findByText("This file is not in SVG format."),
    ).toBeInTheDocument();
    expect(mockDecode).not.toHaveBeenCalled();
    expect(value()).toBeUndefined();
  });

  it("refuses an SVG an image element cannot decode", async () => {
    mockDecode.mockRejectedValue(new DOMException("Invalid image"));
    const user = userEvent.setup();
    const value = renderField(svgSchema);

    await user.upload(screen.getByLabelText(/Field/), svgFile());

    expect(
      await screen.findByText("This file cannot be read as an image."),
    ).toBeInTheDocument();
    expect(value()).toBeUndefined();
  });
});

describe("AppConfigField override seam", () => {
  it("claims image fields, not plain strings", () => {
    const overrides = appConfigOverrides([
      normalizeProperty("logo", imageSchema as JsonSchemaObject),
      normalizeProperty("name", { type: "string" }),
    ]);

    expect(Object.keys(overrides)).toEqual(["logo"]);
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
