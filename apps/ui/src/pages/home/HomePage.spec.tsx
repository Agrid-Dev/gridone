import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const translations: Record<string, string> = {
  "home.devices_one": "Device",
  "home.devices_other": "Devices",
  "home.zones_one": "Zone",
  "home.zones_other": "Zones",
  "home.faults_one": "Active fault",
  "home.faults_other": "Active faults",
  "home.users_one": "User",
  "home.users_other": "Users",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (opts && typeof opts.count === "number") {
        const suffix = opts.count === 1 ? "_one" : "_other";
        return translations[`${key}${suffix}`] ?? key;
      }
      return translations[key] ?? key;
    },
  }),
}));

const mockUseDevicesList = vi.fn();
const mockUseZonesList = vi.fn();
const mockUseFaultsList = vi.fn();
const mockUseUsers = vi.fn();
const mockUsePermissions = vi.fn();

vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => mockUseDevicesList(),
}));
vi.mock("@/hooks/useZonesList", () => ({
  useZonesList: () => mockUseZonesList(),
}));
vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => mockUseFaultsList(),
}));
vi.mock("@/hooks/useUsers", () => ({
  useUsers: () => mockUseUsers(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => mockUsePermissions(),
}));

import HomePage from "./HomePage";

function renderHomePage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <HomePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseDevicesList.mockReturnValue({
    devices: new Array(42).fill({}),
    loading: false,
    error: null,
  });
  mockUseZonesList.mockReturnValue({
    zones: new Array(18).fill({}),
    loading: false,
    error: null,
  });
  mockUseFaultsList.mockReturnValue({
    faults: [],
    loading: false,
    error: null,
  });
  mockUseUsers.mockReturnValue({
    users: new Array(6).fill({}),
    isLoading: false,
    error: null,
  });
  mockUsePermissions.mockReturnValue((perm: string) => perm === "users:read");
});

afterEach(cleanup);

describe("HomePage", () => {
  it("renders the four stat cards with plural labels and counts", () => {
    renderHomePage();

    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Zones")).toBeInTheDocument();
    expect(screen.getByText("Active faults")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("uses the singular label when count is 1", () => {
    mockUseUsers.mockReturnValue({
      users: [{}],
      isLoading: false,
      error: null,
    });
    renderHomePage();

    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });

  it("links each card to its resource page", () => {
    renderHomePage();
    const hrefs = screen
      .getAllByRole("link")
      .map((el) => el.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/devices", "/assets", "/faults", "/users"]),
    );
  });

  it("hides the users card when the viewer lacks users:read", () => {
    mockUsePermissions.mockReturnValue(() => false);
    renderHomePage();

    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Zones")).toBeInTheDocument();
    expect(screen.getByText("Active faults")).toBeInTheDocument();
  });

  it("applies the rose tone icon background to the faults card when faults > 0", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [{}, {}, {}],
      loading: false,
      error: null,
    });
    renderHomePage();

    const faultsLabel = screen.getByText("Active faults");
    const card = faultsLabel.closest("a");
    expect(card).not.toBeNull();
    expect(card?.querySelector(".bg-rose-100")).not.toBeNull();
  });

  it("renders a dash when a hook returns an error", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [],
      loading: false,
      error: "boom",
    });
    renderHomePage();

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
