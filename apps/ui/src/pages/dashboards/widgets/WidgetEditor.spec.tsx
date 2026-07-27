import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Widget, WidgetSchemas } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.fields.title": "Title",
    "widgets.editor.back": "Back to dashboard",
    "widgets.editor.preview": "Preview",
    "widgets.editor.previewPlaceholder": "Fill in the form",
    "widgets.editor.discard.title": "Discard changes?",
    "widgets.editor.discard.cancel": "Keep editing",
    "widgets.editor.discard.confirm": "Discard",
  }),
);

// Imported after the i18n mock is registered.
import { WidgetEditor } from "./WidgetEditor";

/** The `text` type's schema as the backend generates it (pydantic). */
const SCHEMAS = {
  text: {
    additionalProperties: false,
    type: "object",
    title: "TextWidgetConfig",
    properties: {
      type: { const: "text", default: "text", title: "Type", type: "string" },
      text: { title: "Text", type: "string" },
      color: { pattern: "^#[0-9a-fA-F]{6}$", title: "Color", type: "string" },
    },
    required: ["text", "color"],
  },
} as unknown as WidgetSchemas;

const EXISTING_WIDGET = {
  id: "w1",
  title: "Welcome",
  type: "text",
  config: { type: "text", text: "Hello there", color: "#1a2b3c" },
  layout: { x: 0, y: 0, w: 4, h: 2 },
} as unknown as Widget;

function renderEditor({
  widget,
  onSubmit = vi.fn().mockResolvedValue(undefined),
}: {
  widget?: Widget;
  onSubmit?: (values: unknown) => Promise<void>;
} = {}) {
  render(
    <MemoryRouter initialEntries={["/dashboards/d1/widgets/new"]}>
      <Routes>
        <Route
          path="/dashboards/:dashboardId/widgets/new"
          element={
            <WidgetEditor
              dashboardId="d1"
              dashboardName="Energy"
              title="New widget"
              submitLabel="Add widget"
              schemas={SCHEMAS}
              widget={widget}
              onSubmit={onSubmit}
            />
          }
        />
        <Route
          path="/dashboards/:dashboardId"
          element={<p>Dashboard page</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
  return { onSubmit };
}

/** Fill the `text` widget's config with values that satisfy its schema. */
async function fillValidConfig(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Text/), "Boiler room");
  await user.type(screen.getByLabelText(/Color/), "#ff0000");
}

afterEach(cleanup);

describe("WidgetEditor", () => {
  it("previews the widget as soon as the form is valid", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByText("Fill in the form")).toBeInTheDocument();

    await fillValidConfig(user);

    await waitFor(() =>
      expect(screen.getByText("Boiler room")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Fill in the form")).not.toBeInTheDocument();
  });

  it("re-renders the preview on every valid edit", async () => {
    const user = userEvent.setup();
    renderEditor();

    await fillValidConfig(user);
    await waitFor(() =>
      expect(screen.getByText("Boiler room")).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/Text/), " east");

    await waitFor(() =>
      expect(screen.getByText("Boiler room east")).toBeInTheDocument(),
    );
  });

  it("previews an existing widget straight away when editing", async () => {
    renderEditor({ widget: EXISTING_WIDGET });

    await waitFor(() =>
      expect(screen.getByText("Hello there")).toBeInTheDocument(),
    );
    // The title bar of the previewed tile carries the widget's title.
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    // A widget's type is immutable, so it reads as a value, not a control.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("submits the title and the config, type included", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEditor();

    await user.type(screen.getByLabelText("Title"), "Boiler");
    await fillValidConfig(user);
    await user.click(await screen.findByRole("button", { name: "Add widget" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Boiler",
        config: { type: "text", text: "Boiler room", color: "#ff0000" },
      }),
    );
  });

  it("asks before leaving with unsaved changes, then goes back", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(screen.getByLabelText(/Text/), "draft");
    await user.click(screen.getByRole("button", { name: /Back to dashboard/ }));

    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  it("goes back without asking when nothing was edited", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /Back to dashboard/ }));

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });
});
