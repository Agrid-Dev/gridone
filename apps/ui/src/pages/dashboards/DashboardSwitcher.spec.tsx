import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import type { DashboardSummary } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DashboardSwitcher } from "./DashboardSwitcher";

vi.mock("react-i18next", () =>
  createI18nMock({
    "switcher.label": "Switch dashboard",
    "switcher.search": "Search dashboards",
    "switcher.empty": "No dashboard matches.",
    "switcher.current": "Current view",
    "switcher.new": "New dashboard",
  }),
);

let canWrite = true;
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => canWrite,
}));
beforeEach(() => {
  canWrite = true;
});

const SUMMARIES: DashboardSummary[] = [
  { id: "d1", name: "Energy", description: "Consumption", metadata: {} },
  { id: "d2", name: "Comfort", description: "Temperatures", metadata: {} },
];

function LocationProbe() {
  const { pathname, search } = useLocation();
  return (
    <output data-testid="location">
      {pathname}
      {search}
    </output>
  );
}

function renderSwitcher(url = "/dashboards/d1", disabled = false) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DashboardSwitcher
        summaries={SUMMARIES}
        current={SUMMARIES[0]}
        disabled={disabled}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function chooseComfort() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Energy" }));
  await user.click(screen.getByRole("option", { name: /Comfort/ }));
}

afterEach(cleanup);

describe("DashboardSwitcher", () => {
  it("keeps dashboard creation available in the menu even when filtering", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("button", { name: "Energy" }));
    await user.type(screen.getByRole("combobox"), "missing");
    await user.click(screen.getByRole("link", { name: "New dashboard" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboards/new");
  });

  it("does not offer dashboard creation to viewers", async () => {
    canWrite = false;
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("button", { name: "Energy" }));
    expect(
      screen.queryByRole("link", { name: "New dashboard" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["?last=1mo", "?last=1mo"],
    ["?last=3h", "?last=3h"],
    ["?last=7d", ""],
    ["?last=1mo&edit=layout&page=3", "?last=1mo"],
    ["?edit=layout", ""],
    [
      "?start=2026-01-01T00%3A00&end=2026-01-31T23%3A59",
      "?start=2026-01-01T00%3A00&end=2026-01-31T23%3A59",
    ],
  ])(
    "preserves the period alone when navigating from %s",
    async (query, expected) => {
      renderSwitcher(`/dashboards/d1${query}`);
      await chooseComfort();
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/dashboards/d2${expected}`,
      );
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    },
  );

  it("opens the current view checked and searches descriptions", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Energy" }));
    expect(screen.getByRole("option", { name: /Energy/ })).toHaveTextContent(
      "Current view",
    );
    await user.type(screen.getByRole("combobox"), "Temperatures");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Comfort/ })).toBeInTheDocument();
  });

  it("switches to the next view with the keyboard", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("button", { name: "Energy" }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Energy/ })).toHaveAttribute(
        "data-selected",
        "true",
      ),
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboards/d2");
  });

  it("only closes the menu when the current view is selected", async () => {
    const user = userEvent.setup();
    renderSwitcher("/dashboards/d1?last=1mo&page=3");
    await user.click(screen.getByRole("button", { name: "Energy" }));
    await user.click(screen.getByRole("option", { name: /Energy/ }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboards/d1?last=1mo&page=3",
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("blocks the menu during layout editing", async () => {
    const user = userEvent.setup();
    renderSwitcher("/dashboards/d1", true);
    const trigger = screen.getByRole("button", { name: "Energy" });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboards/d1");
  });
});
