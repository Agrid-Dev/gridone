import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, type FieldValues } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "schemaForm.image.choose": "Choose an image",
    "schemaForm.image.replace": "Change the image",
    "schemaForm.image.remove": "Remove the image",
    "schemaForm.image.preview": "Preview of the chosen image",
    "schemaForm.image.tooLarge":
      "This image is too large: {{size}} KB at most.",
    "schemaForm.image.wrongType": "This file is not in {{format}} format.",
    "schemaForm.image.unreadable": "This file cannot be read as an image.",
  }),
);

// jsdom cannot decode images: `createImageBitmap` does not exist there.
const { mockCreateImageBitmap } = vi.hoisted(() => ({
  mockCreateImageBitmap: vi.fn(),
}));
vi.stubGlobal("createImageBitmap", mockCreateImageBitmap);

// Imported after the mocks are registered.
import {
  normalizeProperty,
  SchemaFieldWidget,
  type JsonSchemaObject,
} from "@/components/forms/schema-form";

/** Renders one field the way every schema form reaches an image upload: the
 *  node is normalized into a descriptor, whose `image` the registry's string
 *  widget hands to `ImageController`. Exposes the value the form holds. */
function Harness({
  schema,
  defaultValue,
  onValue,
  fieldError,
  required = false,
}: {
  schema: JsonSchemaObject;
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
    <SchemaFieldWidget
      descriptor={normalizeProperty(
        "field",
        { title: "Field", ...schema },
        { required },
      )}
      name="field"
      control={control}
    />
  );
}

function renderField(
  schema: JsonSchemaObject,
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
  mockCreateImageBitmap.mockReset();
});

const imageSchema: JsonSchemaObject = {
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

describe("ImageController", () => {
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

  it("is chosen as a file even when the node also carries a text marker", () => {
    renderField({ ...imageSchema, multiline: true, secret: true });

    expect(screen.getByLabelText(/Field/)).toHaveAttribute("type", "file");
    expect(
      screen.getByRole("button", { name: "Choose an image" }),
    ).toBeInTheDocument();
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
    // Removed, it would leave the payload without a required value.
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

const svgSchema: JsonSchemaObject = {
  ...imageSchema,
  contentMediaType: "image/svg+xml",
};
const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const svgFile = () =>
  new File([SVG_TEXT], "logo.svg", { type: "image/svg+xml" });

/** `createImageBitmap` rejects every SVG, so an `<img>` element decodes it —
 *  a method jsdom lacks, stubbed here. */
describe("ImageController with an SVG", () => {
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
