import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { GridoneError } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "fields.name": "Building name",
    "fields.address": "Address",
    "fields.surface": "Surface",
    "fields.floors": "Floors",
    "fields.year_built": "Year built",
    "fields.operator": "Operator",
    "fields.icon": "Icon",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
  }),
);

vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));

// The real picker is a Radix popover; the override wiring (value, onChange,
// building name) is what this spec verifies, not the picker internals.
const mockIconPicker = vi.hoisted(() => vi.fn());
vi.mock("@/components/forms/IconPicker", () => ({
  IconPicker: (props: {
    value: string | null;
    onChange: (value: string) => void;
    name?: string | null;
  }) => {
    mockIconPicker(props);
    return (
      <input
        data-testid="icon-picker"
        value={props.value ?? ""}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

// Imported after the mocks are registered.
import { BuildingProfileForm } from "./BuildingProfileForm";
import profileSchema from "@/components/forms/schema-form/__fixtures__/building-profile.json";

const renderForm = (
  defaultValues: Record<string, unknown>,
  onSubmit = vi.fn(),
) => {
  render(
    <BuildingProfileForm
      schema={profileSchema}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      isPending={false}
    />,
  );
  return onSubmit;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BuildingProfileForm — schema-driven rendering (AGR-920)", () => {
  it("renders the schema fields with profile labels, hiding the raw-only ones", () => {
    renderForm({ name: "HQ" });

    expect(screen.getByLabelText("Building name")).toHaveValue("HQ");
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Surface")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Floors")).toHaveAttribute("type", "number");

    // HIDDEN_FIELDS are not rendered…
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cover/i)).not.toBeInTheDocument();
  });

  it("submits edited values and round-trips the hidden fields", async () => {
    const onSubmit = renderForm({
      name: "HQ",
      latitude: 48.85,
      longitude: 2.35,
      cover_url: "https://example.com/cover.png",
    });

    fireEvent.change(screen.getByLabelText("Floors"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "HQ",
      floors: 4,
      // …but their stored values survive the save untouched.
      latitude: 48.85,
      longitude: 2.35,
      cover_url: "https://example.com/cover.png",
    });
  });

  it("drives the icon through the picker override, fed the building name", async () => {
    const onSubmit = renderForm({ name: "HQ", icon: "leaf" });

    expect(screen.getByTestId("icon-picker")).toHaveValue("leaf");
    expect(mockIconPicker).toHaveBeenCalledWith(
      expect.objectContaining({ name: "HQ" }),
    );

    fireEvent.change(screen.getByTestId("icon-picker"), {
      target: { value: "factory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ icon: "factory" });
  });

  it("attaches structured server errors to schema-driven profile fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["body", "year_built"],
          msg: "Year is outside the supported range",
          type: "less_than_equal",
        },
      ]),
    );
    renderForm({ name: "HQ" }, onSubmit);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Year is outside the supported range"),
    ).toBeInTheDocument();
  });
});
