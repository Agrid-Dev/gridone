import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { Driver } from "@/api/drivers";
import { createI18nMock } from "@/test/i18nMock";

const { getDriver } = vi.hoisted(() => ({ getDriver: vi.fn() }));

vi.mock("@/api/drivers", () => ({
  getDriver,
  getDrivers: vi.fn(),
  createDriver: vi.fn(),
  deleteDriver: vi.fn(),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Drivers",
    "fields.vendor": "Vendor",
    "fields.model": "Model",
    "fields.version": "Version",
    "fields.protocol": "Protocol",
    "fields.type": "Type",
    "fields.updateStrategy": "Update strategy",
    "fields.deviceConfig": "Device config",
    "fields.deviceConfigDescription": "Configurable fields",
    "fields.none": "None",
    attribute: "attributes",
    "errors.notFound": "Not found",
    "errors.default": "Something went wrong",
    "common.back": "Back",
    "common.home": "Home",
  }),
);

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => false,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Imported after the mocks so transitive react-i18next / api imports resolve to
// the mocked modules.
import { renderWithBoundary } from "@/test/renderWithBoundary";
import DriverDetails from "./DriverDetails";

function makeDriver(): Driver {
  return {
    id: "d-1",
    type: null,
    vendor: "Acme",
    model: "T-1000",
    version: "1.2.3",
    transport: "http",
    updateStrategy: {},
    deviceConfig: [],
    attributes: [],
  };
}

function renderRoute(initialEntries = ["/d-1"], path = ":driverId") {
  return renderWithBoundary(<DriverDetails />, { path, initialEntries });
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleError.mockRestore();
});
beforeEach(() => getDriver.mockReset());
afterEach(cleanup);

describe("DriverDetails route", () => {
  it("fetches by the route param and renders the driver once loaded", async () => {
    getDriver.mockResolvedValue(makeDriver());
    renderRoute();
    expect(await screen.findByText("d-1")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(getDriver).toHaveBeenCalledWith("d-1");
  });

  it("renders the not-found fallback when the route param is missing", () => {
    renderRoute(["/"], "*");
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(getDriver).not.toHaveBeenCalled();
  });
});
