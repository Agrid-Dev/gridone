import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";

const state = vi.hoisted(() => ({ configViewFails: false }));

vi.mock("react-i18next", () =>
  createI18nMock({
    "errors.default": "Something went wrong",
    "common.back": "Back",
    "common.home": "Home",
  }),
);

// The device frame, with the boundary the real layout puts around everything:
// a config failure that reaches it replaces the header and tabs.
vi.mock("./DeviceLayout", async () => {
  const { Link, Outlet } = await import("react-router");
  const { ResourceBoundary } = await import("@/components/ResourceBoundary");
  return {
    default: () => (
      <ResourceBoundary resetKeys={[]}>
        <nav aria-label="Device frame">
          <Link to="/devices/a/config/automations">Automations</Link>
        </nav>
        <Outlet />
      </ResourceBoundary>
    ),
  };
});
vi.mock("./DeviceConfigView", () => ({
  default: () => {
    if (state.configViewFails) throw new Error("query failed");
    return <h2>General configuration</h2>;
  },
}));
vi.mock("./automations/DeviceAutomations", () => ({
  default: () => <h2>Device automations</h2>,
}));
vi.mock("./operating-rules", () => {
  throw new Error("Failed to fetch dynamically imported module");
});
vi.mock("./DeviceLiveControl", () => ({ default: () => null }));
vi.mock("./DeviceCreate", () => ({ default: () => null }));
vi.mock("./DeviceEdit", () => ({ default: () => null }));
vi.mock("./DeviceCommandsPage", () => ({ default: () => null }));
vi.mock("./device-history/routes", () => ({ deviceHistoryRoutes: null }));

import Device from "./index";

beforeEach(() => {
  state.configViewFails = false;
  // React and the error boundary log every caught error.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/devices/*" element={<Device />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const frame = () => screen.queryByRole("navigation", { name: "Device frame" });

describe("a failure under device configuration", () => {
  it("renders the section normally", async () => {
    setup("/devices/a/config");
    expect(
      await screen.findByRole("heading", { name: "General configuration" }),
    ).toBeInTheDocument();
    expect(frame()).toBeInTheDocument();
  });

  it("keeps the device frame when a section crashes", async () => {
    state.configViewFails = true;
    setup("/devices/a/config");
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(frame()).toBeInTheDocument();
  });

  it("keeps the device frame when a lazy section fails to load", async () => {
    setup("/devices/a/config/operating-rules");
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(frame()).toBeInTheDocument();
  });

  it("clears the failure on the next navigation", async () => {
    state.configViewFails = true;
    const user = setup("/devices/a/config");
    await screen.findByText("Something went wrong");
    await user.click(screen.getByRole("link", { name: "Automations" }));
    expect(
      await screen.findByRole("heading", { name: "Device automations" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });
});
