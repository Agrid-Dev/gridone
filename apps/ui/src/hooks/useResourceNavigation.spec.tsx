import { createI18nMock } from "@/test/i18nMock";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { ResourceLink } from "@/components/ResourceLink";
import { BackLink } from "@/components/BackLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import {
  clearNavigation,
  currentEntry,
  internalUrl,
  markResourceDeleted,
  navigationStore,
  validOrigin,
  type ReturnOrigin,
} from "@/lib/navigation";
import { useNavigationEntries } from "./useNavigationEntries";

vi.mock("react-i18next", () =>
  createI18nMock({
    "navigation.back.devices": "Back to devices",
    "navigation.backToResource": "Back to {{name}}",
  }),
);

function Frame() {
  useNavigationEntries();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <output data-testid="resume">
        {String(
          !!location.state?.resumeEntry || !!location.state?.resumeNavigation,
        )}
      </output>
      <button onClick={() => navigate(-1)}>Browser back</button>
      <button onClick={() => navigate(1)}>Browser forward</button>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/devices" element={<List />} />
          <Route path="/devices/:id/*" element={<Device />} />
          <Route
            path="/assets/zone"
            element={
              <>
                <ResourceHeader title="Zone" />
                <ResourceLink to="/devices/a">Device A</ResourceLink>
              </>
            }
          />
          <Route
            path="/transports/network"
            element={
              <>
                <BackLink to="/transports">Networks</BackLink>
                <ResourceHeader title="Network" />
                <ResourceLink to="/devices/b">Device B</ResourceLink>
              </>
            }
          />
        </Routes>
      </main>
    </>
  );
}
function List() {
  return (
    <>
      <ResourceHeader title="Devices" />
      <ResourceLink to="/devices/a">Device A</ResourceLink>
    </>
  );
}
function Device() {
  const location = useLocation();
  const [, setParams] = useSearchParams();
  const id = location.pathname.split("/")[2];
  return (
    <>
      <BackLink to="/devices">Devices</BackLink>
      <ResourceHeader title={`Device ${id.toUpperCase()}`} />
      <ResourceLink to={`/devices/${id}/history`}>History</ResourceLink>
      <ResourceLink to={`/devices/${id}/config`}>Configuration</ResourceLink>
      <ResourceLink to="/transports/network">Network</ResourceLink>
      <button
        onClick={() =>
          setParams(
            {
              start: "2026-01-01T00:00:00Z",
              end: "2026-01-02T00:00:00Z",
              metric: "temperature",
              page: "2",
            },
            { replace: true },
          )
        }
      >
        Set history
      </button>
      <output data-testid="visit">
        {currentEntry(location).context.visit}
      </output>
    </>
  );
}
function mount(path = "/devices?search=Pump&type=pump&health=faulty") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Frame />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  clearNavigation();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("resource return navigation", () => {
  it("returns straight to the filtered list after several tabs, and keeps browser forward chronological", async () => {
    mount();
    await userEvent.click(screen.getByRole("link", { name: "Device A" }));
    await userEvent.click(screen.getByRole("link", { name: "History" }));
    await userEvent.click(screen.getByRole("link", { name: "Configuration" }));
    await userEvent.click(
      screen.getByRole("link", { name: "Back to devices" }),
    );
    expect(screen.getByTestId("url")).toHaveTextContent(
      "/devices?search=Pump&type=pump&health=faulty",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Browser forward" }),
    );
    expect(screen.getByTestId("url").textContent).toBe("/devices/a");
  });
  it("unwinds zone → device A → network → device B", async () => {
    mount("/assets/zone");
    await userEvent.click(screen.getByRole("link", { name: "Device A" }));
    await userEvent.click(screen.getByRole("link", { name: "Network" }));
    await userEvent.click(screen.getByRole("link", { name: "Device B" }));
    await userEvent.click(
      screen.getByRole("link", { name: "Back to Network" }),
    );
    await userEvent.click(
      screen.getByRole("link", { name: "Back to Device A" }),
    );
    await userEvent.click(screen.getByRole("link", { name: "Back to Zone" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/assets/zone");
  });
  it("restores the exact custom history period, metric and page after tab changes", async () => {
    mount("/devices/a/history");
    await userEvent.click(screen.getByRole("button", { name: "Set history" }));
    const historyUrl = screen.getByTestId("url").textContent;
    await userEvent.click(screen.getByRole("link", { name: "Configuration" }));
    await userEvent.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByTestId("url").textContent).toBe(historyUrl);
    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute(
      "href",
      "/devices",
    );
  });
  it("keeps context when remounting the same history entry (reload)", async () => {
    const mounted = mount("/assets/zone");
    await userEvent.click(screen.getByRole("link", { name: "Device A" }));
    const key = navigationStore.history[1];
    mounted.unmount();
    render(
      <MemoryRouter initialEntries={[{ pathname: "/devices/a", key }]}>
        <Frame />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Back to Zone" })).toHaveAttribute(
      "href",
      "/assets/zone",
    );
  });
  it("replaces when the origin entry was replaced, without making a return loop", async () => {
    mount();
    navigationStore.entries[navigationStore.history[0]].values.view = "table";
    await userEvent.click(screen.getByRole("link", { name: "Device A" }));
    delete navigationStore.history[0];
    await userEvent.click(
      screen.getByRole("link", { name: "Back to devices" }),
    );
    expect(screen.getByTestId("url").textContent).toBe(
      "/devices?search=Pump&type=pump&health=faulty",
    );
    const restored = Object.values(navigationStore.entries).at(-1);
    expect(restored?.values.view).toBe("table");
  });
  it("does not intercept modified clicks", () => {
    mount();
    fireEvent.click(screen.getByRole("link", { name: "Device A" }), {
      ctrlKey: true,
    });
    expect(screen.getByTestId("url")).toHaveTextContent("/devices?search=Pump");
  });
  it("does not carry a one-off resumed entry into the next resource visit", async () => {
    mount();
    await userEvent.click(screen.getByRole("link", { name: "Device A" }));
    delete navigationStore.history[0];
    await userEvent.click(
      screen.getByRole("link", { name: "Back to devices" }),
    );
    expect(screen.getByTestId("resume").textContent).toBe("true");
    await userEvent.click(screen.getByRole("link", { name: "Device A" }));
    expect(screen.getByTestId("resume").textContent).toBe("false");
    expect(
      screen.getByRole("link", { name: "Back to devices" }),
    ).toBeInTheDocument();
  });
  it("restores page and internal scroll separately, with focus on the source link", async () => {
    mount();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 240,
    });
    const link = screen.getByRole("link", { name: "Device A" });
    link.focus();
    await userEvent.click(link);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    await userEvent.click(
      screen.getByRole("link", { name: "Back to devices" }),
    );
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 240));
    expect(screen.getByRole("link", { name: "Device A" })).toHaveFocus();
  });
});

describe("navigation validation", () => {
  it.each([
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "javascript:alert(1)",
    "/devices\n",
    undefined,
  ])("rejects unsafe destination %s", (url) =>
    expect(internalUrl(url)).toBeNull(),
  );
  it("ignores same-resource and known deleted origins", () => {
    const origin: ReturnOrigin = {
      url: "/devices/a/history",
      name: "A",
      named: true,
      key: "a",
      index: 0,
    };
    expect(validOrigin(origin, "/devices/a/config")).toBeUndefined();
    markResourceDeleted("/devices/a");
    expect(validOrigin(origin, "/transports/n")).toBeUndefined();
  });
});
