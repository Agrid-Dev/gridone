import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import Devices from "..";

vi.mock("../DevicesList", () => ({ default: () => <p>Devices list</p> }));
vi.mock("../device", () => ({ default: () => <p>Device page</p> }));

function Landed() {
  const { pathname, search } = useLocation();
  return <output>{pathname + search}</output>;
}

function setup(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/devices/*" element={<Devices />} />
        <Route path="/groups/*" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
}
afterEach(cleanup);

describe("former group form addresses", () => {
  it.each([
    ["/devices/views/new", "/groups/new"],
    ["/devices/views/new?advanced=1", "/groups/new?advanced=1"],
    [
      "/devices/views/new?device_id=a&device_id=b",
      "/groups/new?device_id=a&device_id=b",
    ],
    ["/devices/views/v1/edit", "/groups/v1/edit"],
  ])("send %s to %s", async (from, to) => {
    setup(from);
    expect(await screen.findByRole("status")).toHaveTextContent(to);
  });
});
