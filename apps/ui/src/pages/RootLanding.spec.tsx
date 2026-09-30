import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

let entries: { dashboards: { id: string; name: string }[]; ready: boolean };
let dashboardsEnabled = true;
vi.mock("./dashboards/useDashboards", () => ({
  useDashboardEntries: () => entries,
}));
vi.mock("@/utils/featureFlags", () => ({
  useFeatureEnabled: () => dashboardsEnabled,
}));
vi.mock("./home", () => ({ default: () => <p>Home</p> }));

import RootLanding from "./RootLanding";

function renderRoot() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route index element={<RootLanding />} />
        <Route path="/dashboards/:id" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  entries = { dashboards: [], ready: true };
  dashboardsEnabled = true;
});
afterEach(cleanup);

describe("RootLanding", () => {
  it("opens the first dashboard in order", () => {
    entries = {
      dashboards: [
        { id: "d1", name: "ECS Ouest" },
        { id: "d2", name: "CTA" },
      ],
      ready: true,
    };
    renderRoot();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("falls back to the home page without a dashboard, or with the flag off", () => {
    renderRoot();
    expect(screen.getByText("Home")).toBeInTheDocument();
    cleanup();

    entries = { dashboards: [{ id: "d1", name: "ECS Ouest" }], ready: true };
    dashboardsEnabled = false;
    renderRoot();
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("draws nothing until the list is known, so the home page never flashes", () => {
    entries = { dashboards: [], ready: false };
    const { container } = renderRoot();
    expect(container).toBeEmptyDOMElement();
  });
});
