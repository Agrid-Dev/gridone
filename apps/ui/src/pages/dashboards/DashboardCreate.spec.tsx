import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import DashboardCreate from "./DashboardCreate";

vi.mock("react-i18next", () =>
  createI18nMock({
    "create.title": "New dashboard",
    "create.submit": "Create dashboard",
    "fields.name": "Name",
    "fields.type": "Type",
    "fields.description": "Description",
    "fields.icon": "Icon",
    "icon.none": "No icon",
    "types.live.label": "Live",
    "types.live.description": "Shows the present.",
    "types.history.label": "History",
    "types.history.description": "Reads recorded data over a period.",
    "common:common.cancel": "Cancel",
  }),
);

const createDashboard = vi.fn();
vi.mock("./useDashboards", () => ({
  useCreateDashboard: () => ({ createDashboard }),
}));

afterEach(() => {
  cleanup();
  createDashboard.mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/dashboards/new"]}>
      <DashboardCreate />
    </MemoryRouter>,
  );
}

it("creates a live dashboard by default", async () => {
  const user = userEvent.setup();
  createDashboard.mockResolvedValue({ id: "d9", name: "Ops" });
  renderPage();

  const type = screen.getByRole("combobox", { name: /Type/ });
  expect(type).toHaveTextContent("Live");
  expect(screen.getByText("Shows the present.")).toBeInTheDocument();

  await user.type(screen.getByLabelText(/Name/), "Ops");
  await user.click(screen.getByRole("button", { name: "Create dashboard" }));

  await waitFor(() =>
    expect(createDashboard).toHaveBeenCalledWith({
      name: "Ops",
      type: "live",
      description: "",
      icon: null,
    }),
  );
});

it("lets the author pick the history type, explained in place", async () => {
  const user = userEvent.setup();
  createDashboard.mockResolvedValue({ id: "d9", name: "Comptage" });
  renderPage();

  await user.click(screen.getByRole("combobox", { name: /Type/ }));
  await user.click(screen.getByRole("option", { name: "History" }));
  expect(
    screen.getByText("Reads recorded data over a period."),
  ).toBeInTheDocument();

  await user.type(screen.getByLabelText(/Name/), "Comptage");
  await user.click(screen.getByRole("button", { name: "Create dashboard" }));

  await waitFor(() =>
    expect(createDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Comptage", type: "history" }),
    ),
  );
});
