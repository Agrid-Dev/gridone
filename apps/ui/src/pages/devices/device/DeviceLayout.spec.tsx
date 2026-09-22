import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import DeviceLayout from "./DeviceLayout";

vi.mock("@/hooks/useDevice", () => ({
  useDeviceFromRoute: () => ({ id: "a" }),
}));
vi.mock("@/components/ActiveFaultsSection", () => ({
  ActiveFaultsSection: () => <div>Active faults</div>,
}));
vi.mock("./DeviceHeader", () => ({ DeviceHeader: () => <h1>Device a</h1> }));
vi.mock("./DeviceTabs", () => ({ DeviceTabs: () => <nav>Tabs</nav> }));

afterEach(cleanup);

function setup(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/devices/:deviceId" element={<DeviceLayout />}>
          <Route index element={<h2>Supervision</h2>} />
          <Route path="config" element={<h2>Configuration</h2>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("DeviceLayout", () => {
  it("shows active faults on the supervision sections", () => {
    setup("/devices/a");
    expect(screen.getByText("Active faults")).toBeInTheDocument();
  });

  it("hides active faults in the configuration section", () => {
    setup("/devices/a/config");
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.queryByText("Active faults")).not.toBeInTheDocument();
  });
});
