import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DashboardType, TextWidgetConfig, Widget } from "@gridone/sdk";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardDetail from "./DashboardDetail";

vi.mock("react-i18next", () =>
  createI18nMock({
    "layout.edit": "Edit layout",
    "widgets.add": "Add widget",
    "widgets.actions.edit": "Edit widget",
    "widgets.actions.delete": "Delete widget",
    "widgets.actions.label": "Actions",
    "toolbox.show": "Edit dashboard",
    "toolbox.hide": "Close configuration",
    "layout.cancel": "Cancel",
    "layout.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "widgets.errors.incompatible_type": "This widget does not fit here.",
  }),
);

let canWrite = true;
let editing = false;
let icon: string | null = null;
let type: DashboardType = "history";
let widgets: Widget[] = [];
const removeWidget = vi.fn().mockResolvedValue(undefined);
const WIDGET: Widget = {
  id: "w1",
  type: "text",
  title: "Consumption",
  config: { type: "text", text: "Hello", color: "#ffffff" } as TextWidgetConfig,
  layout: { x: 0, y: 0, w: 6, h: 4 },
  metadata: {},
};
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => canWrite,
}));
vi.mock("./useDashboards", () => ({
  useDashboardFromRoute: () => ({
    id: "d1",
    name: "Energy",
    type,
    icon,
    widgets,
    metadata: {},
  }),
}));
vi.mock("./useWidgets", () => ({
  useRemoveWidget: () => ({ removeWidget }),
}));
vi.mock("./useLayoutEditor", () => ({
  useLayoutEditor: () => ({
    editing,
    layout: [],
    dirty: false,
    onLayoutChange: vi.fn(),
  }),
}));
vi.mock("@/components/TimeRangeSelect", () => ({
  TimeRangeSelect: () => <span>Period</span>,
}));

beforeEach(() => {
  canWrite = true;
  editing = false;
  icon = null;
  type = "history";
  widgets = [];
  removeWidget.mockClear();
});
afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/dashboards/d1"]}>
      <TooltipProvider>
        <DashboardDetail />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

it("titles the page with the dashboard, no view switcher, with one add-widget action", () => {
  renderPage();
  const heading = screen.getByRole("heading", { level: 2 });
  expect(heading).toHaveTextContent("Energy");
  expect(within(heading).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Add widget" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Add widget" })).toHaveAttribute(
    "href",
    "/dashboards/d1/widgets/new",
  );
  expect(
    screen.getByRole("button", { name: "Edit dashboard" }),
  ).toBeInTheDocument();
});

it("carries the period selector in the body of a history dashboard, and none on a live one", () => {
  renderPage();
  const period = screen.getByText("Period");
  // Inside the dashboard, below the header: it is the dashboard's own
  // control, not a page action.
  expect(
    screen.getByRole("heading", { level: 2 }).parentElement,
  ).not.toContainElement(period);
  cleanup();

  type = "live";
  renderPage();
  expect(screen.queryByText("Period")).not.toBeInTheDocument();
});

it("renders a flagged widget as an error tile that can still be removed", async () => {
  const user = userEvent.setup();
  widgets = [{ ...WIDGET, error: "incompatible_type" }];
  renderPage();

  expect(screen.getByRole("alert")).toHaveTextContent(
    "This widget does not fit here.",
  );
  expect(screen.queryByText("Hello")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit dashboard" }));
  expect(screen.getByRole("button", { name: "Delete widget" })).toBeEnabled();
});

it("carries the dashboard's icon in the title, and no glyph without one", () => {
  renderPage();
  expect(
    screen.getByRole("heading", { level: 2 }).querySelector("svg"),
  ).toBeNull();
  cleanup();

  icon = "fan";
  renderPage();
  expect(
    screen.getByRole("heading", { level: 2 }).querySelector("svg"),
  ).toHaveClass("lucide-fan");
});

it("hides creation and editing for a viewer", () => {
  canWrite = false;
  renderPage();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Energy");
  expect(
    screen.queryByRole("link", { name: "Add widget" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Edit dashboard" }),
  ).not.toBeInTheDocument();
});

it("disables adding widgets while the layout is being edited", () => {
  editing = true;
  renderPage();
  expect(screen.getByRole("button", { name: "Add widget" })).toBeDisabled();
  expect(
    screen.queryByRole("link", { name: "Add widget" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
});

it("shows direct widget actions only while configuration is open, without duplicating add", async () => {
  const user = userEvent.setup();
  widgets = [WIDGET];
  renderPage();
  expect(
    screen.queryByRole("link", { name: "Edit widget" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete widget" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit dashboard" }));
  expect(screen.getAllByRole("link", { name: "Add widget" })).toHaveLength(1);
  // The list-level actions moved to Configuration: only the layout is edited here.
  expect(screen.getByRole("button", { name: "Edit layout" })).toBeEnabled();
  for (const name of ["New dashboard", "Edit details", "Delete"]) {
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "Edit widget" })).toHaveAttribute(
    "href",
    "/dashboards/d1/widgets/w1/edit",
  );
  expect(screen.getByRole("button", { name: "Delete widget" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Actions" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Close configuration" }));
  expect(
    screen.queryByRole("link", { name: "Edit widget" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete widget" }),
  ).not.toBeInTheDocument();
});

it("requires confirmation from the delete icon and restores focus on cancellation", async () => {
  const user = userEvent.setup();
  widgets = [WIDGET];
  renderPage();
  await user.click(screen.getByRole("button", { name: "Edit dashboard" }));
  const deleteButton = screen.getByRole("button", { name: "Delete widget" });
  await user.click(deleteButton);
  expect(removeWidget).not.toHaveBeenCalled();
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(removeWidget).not.toHaveBeenCalled();
  await waitFor(() => expect(deleteButton).toHaveFocus());

  await user.click(deleteButton);
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  expect(removeWidget).toHaveBeenCalledExactlyOnceWith("w1");
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
});
