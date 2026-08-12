import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Driver } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Drivers",
    caption: "Driver catalog",
    "actions.create": "New driver",
    "filters.label": "Filter by type",
    "table.driver": "Driver",
    "table.type": "Type",
    "table.protocol": "Protocol",
    "table.attributes": "Attributes",
    "protocols.http": "HTTP",
    "protocols.mbus": "M-Bus",
    "protocols.modbus-tcp": "Modbus TCP",
    "common:common.allTypes": "All types",
    "common:common.loading": "Loading...",
    "thermostat.name": "Thermostat",
    "awhp.name": "Heat pump",
    "empty.noMatch": "No {{resourceName}} matches",
    "empty.title": "No {{resourceName}} yet",
    "empty.clearFiltersHint": "Clear the filters",
    "empty.clearFilters": "Clear filters",
  }),
);

const mockUseDrivers = vi.fn();
vi.mock("./useDrivers", () => ({
  useDrivers: () => mockUseDrivers(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

import DriversList from "./DriversList";

function makeDriver(
  id: string,
  {
    type = null,
    transport = "http",
    attributeCount = 0,
    imageSrc = null,
  }: {
    type?: string | null;
    transport?: string;
    attributeCount?: number;
    imageSrc?: string | null;
  } = {},
): Driver {
  return {
    id,
    type,
    transport,
    image_src: imageSrc,
    attributes: Array.from({ length: attributeCount }, (_, index) => ({
      name: `attr_${index}`,
    })),
    device_config: [],
  } as unknown as Driver;
}

function mockDrivers(
  drivers: Driver[],
  {
    isLoading = false,
    isFetching = false,
    isFetched = true,
  }: {
    isLoading?: boolean;
    isFetching?: boolean;
    isFetched?: boolean;
  } = {},
) {
  mockUseDrivers.mockReturnValue({
    driversListQuery: { data: drivers, isLoading, isFetching, isFetched },
  });
}

function renderAt(initialEntries: string[] = ["/drivers"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <DriversList />
    </MemoryRouter>,
  );
}

const chips = () =>
  within(screen.getByRole("group", { name: "Filter by type" })).getAllByRole(
    "button",
  );

const driverLinks = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/drivers/"));

beforeEach(() => {
  mockDrivers([
    makeDriver("thermocktat_http", {
      type: "thermostat",
      transport: "http",
      attributeCount: 8,
    }),
    makeDriver("chiller_emulator_modbus", {
      type: "awhp",
      transport: "modbus-tcp",
      attributeCount: 9,
    }),
    makeDriver("mbus_meter_emulator", { transport: "mbus", attributeCount: 3 }),
  ]);
});

afterEach(() => {
  cleanup();
  mockUseDrivers.mockReset();
});

describe("DriversList — table", () => {
  it("lists every driver alphabetically with protocol and attribute count", () => {
    renderAt();
    expect(driverLinks().map((link) => link.textContent)).toEqual([
      "chiller_emulator_modbus",
      "mbus_meter_emulator",
      "thermocktat_http",
    ]);
    const row = screen.getByText("chiller_emulator_modbus").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("Modbus TCP")).toBeInTheDocument();
    expect(within(row!).getByText("9")).toBeInTheDocument();
    expect(within(row!).getByText("Heat pump")).toBeInTheDocument();
  });

  it("renders a dash instead of a type chip for untyped drivers", () => {
    renderAt();
    const row = screen.getByText("mbus_meter_emulator").closest("tr");
    expect(within(row!).getByText("—")).toBeInTheDocument();
  });

  it("renders skeletons instead of the table while loading", () => {
    mockDrivers([], {
      isLoading: false,
      isFetching: true,
      isFetched: false,
    });
    renderAt();
    expect(
      screen.getByRole("status", { name: "Loading..." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("No driver yet")).not.toBeInTheDocument();
  });
});

describe("DriversList — type chips", () => {
  it("counts every driver on 'all' and one chip per type present", () => {
    renderAt();
    expect(chips().map((chip) => chip.textContent)).toEqual([
      "All types3",
      "Thermostat1",
      "Heat pump1",
    ]);
  });

  it("marks the chip matching ?type as pressed and filters the table", () => {
    renderAt(["/drivers?type=thermostat"]);
    expect(
      chips().find((chip) => chip.getAttribute("aria-pressed") === "true")
        ?.textContent,
    ).toBe("Thermostat1");
    expect(driverLinks().map((link) => link.textContent)).toEqual([
      "thermocktat_http",
    ]);
  });

  it("filters the table when a chip is clicked, keeping the counts unfiltered", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Heat pump1" }));
    expect(driverLinks().map((link) => link.textContent)).toEqual([
      "chiller_emulator_modbus",
    ]);
    expect(chips().map((chip) => chip.textContent)).toEqual([
      "All types3",
      "Thermostat1",
      "Heat pump1",
    ]);
  });

  it("clears the filter when 'all' is clicked", async () => {
    renderAt(["/drivers?type=thermostat"]);
    await userEvent.click(screen.getByRole("button", { name: "All types3" }));
    expect(driverLinks()).toHaveLength(3);
  });
});

describe("DriversList — empty state", () => {
  it("offers to clear the filters when no driver matches", () => {
    mockDrivers([makeDriver("thermocktat_http", { type: "thermostat" })]);
    renderAt(["/drivers?type=awhp"]);
    expect(screen.getByText("No driver matches")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });
});
