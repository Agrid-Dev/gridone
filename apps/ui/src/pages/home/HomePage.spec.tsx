import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "home.devices": "Devices",
    "home.zones": "Zones",
    "home.faults": "Active faults",
    "home.users": "Users",
  }),
);

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
  it("renders all four stat cards with their counts for an admin", () => {
    renderHomePage();

    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Zones")).toBeInTheDocument();
    expect(screen.getByText("Active faults")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();

    const values = screen
      .getAllByTestId("stat-value")
      .map((el) => el.textContent);
    expect(values).toEqual(["42", "18", "0", "6"]);
  });

  it("links each card to its resource page", () => {
    renderHomePage();
    const links = screen
      .getAllByRole("link")
      .map((el) => el.getAttribute("href"));
    expect(links).toEqual(
      expect.arrayContaining(["/devices", "/assets", "/faults", "/users"]),
    );
  });

  it("hides the users card when the viewer lacks users:read", () => {
    mockUsePermissions.mockReturnValue(() => false);
    renderHomePage();

    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Zones")).toBeInTheDocument();
    expect(screen.getByText("Active faults")).toBeInTheDocument();
  });

  it("applies destructive styling to the faults value when faults > 0", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [{}, {}, {}],
      loading: false,
      error: null,
    });
    renderHomePage();

    const values = screen.getAllByTestId("stat-value");
    const faultValue = values.find((el) => el.textContent === "3");
    expect(faultValue).toBeDefined();
    expect(faultValue?.className).toContain("text-destructive");
  });

  it("renders dashes when hooks return errors", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [],
      loading: false,
      error: "boom",
    });
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: false,
      error: "boom",
    });
    renderHomePage();

    const values = screen
      .getAllByTestId("stat-value")
      .map((el) => el.textContent);
    expect(values).toContain("—");
  });
});
