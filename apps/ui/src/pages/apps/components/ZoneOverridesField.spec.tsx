import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, type FieldValues } from "react-hook-form";
import type { Asset } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { AppSchemaNode } from "@/lib/appConfigSchema";

vi.mock("react-i18next", () =>
  createI18nMock({
    "zoneOverrides.count": "{{count}} overrides",
    "zoneOverrides.collapse": "Collapse",
    "zoneOverrides.expand": "Expand",
    "zoneOverrides.searchPlaceholder": "Search rooms",
    "zoneOverrides.empty": "No room has an override yet.",
    "zoneOverrides.noResults": "No override matches this search.",
    "zoneOverrides.add": "Add override",
    "zoneOverrides.noneAvailable": "No piloted room available",
    "zoneOverrides.remove": "Remove override",
    "zoneOverrides.columns.zone": "Zone",
    "zoneOverrides.columns.zoneType": "Type",
    "zoneOverrides.columns.enabled": "Enabled",
  }),
);

const assets: Asset[] = [
  { id: "z1", type: "zone", name: "Room 101", path: ["z1"], position: 0 },
  { id: "z2", type: "zone", name: "Room 102", path: ["z2"], position: 1 },
  { id: "z3", type: "zone", name: "Room 103", path: ["z3"], position: 2 },
];

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: assets,
    assetsById: Object.fromEntries(assets.map((a) => [a.id, a])),
    isLoading: false,
  }),
}));

// Radix/cmdk primitives inlined: jsdom cannot drive their portals and pointer
// events, and row/picker wiring is what matters here.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandInput: () => null,
  CommandList: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
}));

import { ZoneOverridesField } from "./ZoneOverridesField";

const schema: AppSchemaNode = {
  type: "array",
  title: "Zone overrides",
  items: {
    type: "object",
    properties: {
      zone_id: { type: "string", format: "asset-id" },
      zone_type: { type: "string" },
      comfort: { type: "number" },
      enabled: { type: "boolean", default: true },
    },
  },
};

function Harness({ defaultValues }: { defaultValues: FieldValues }) {
  const { control } = useForm<FieldValues>({ defaultValues });
  return (
    <ZoneOverridesField
      name="zone_overrides"
      schema={schema}
      control={control}
      required={false}
    />
  );
}

function renderField(defaultValues: FieldValues) {
  render(<Harness defaultValues={defaultValues} />);
}

afterEach(cleanup);

describe("ZoneOverridesField", () => {
  it("renders only rooms that have an override, not every piloted room", () => {
    renderField({
      piloted_zones: ["z1", "z2", "z3"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    const table = within(screen.getByRole("table"));
    expect(table.getByText("Room 101")).toBeInTheDocument();
    expect(table.queryByText("Room 102")).not.toBeInTheDocument();
    expect(table.queryByText("Room 103")).not.toBeInTheDocument();
  });

  it("filters visible rows by room name", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1", "z2"],
      zone_overrides: [
        { zone_id: "z1", zone_type: "office", enabled: true },
        { zone_id: "z2", zone_type: "office", enabled: true },
      ],
    });

    await user.type(screen.getByPlaceholderText("Search rooms"), "101");

    expect(screen.getByText("Room 101")).toBeInTheDocument();
    expect(screen.queryByText("Room 102")).not.toBeInTheDocument();
  });

  it("shows a no-results message when the search matches no override", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    await user.type(screen.getByPlaceholderText("Search rooms"), "nope");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByText("No override matches this search."),
    ).toBeInTheDocument();
  });

  it("offers only piloted rooms not yet overridden in the add picker", () => {
    renderField({
      piloted_zones: ["z1", "z2", "z3"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(within(options[0]).getByText("Room 102")).toBeInTheDocument();
    expect(within(options[1]).getByText("Room 103")).toBeInTheDocument();
  });

  it("adds a room override when picked", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1", "z2"],
      zone_overrides: [],
    });

    await user.click(screen.getByRole("option", { name: /Room 101/ }));

    expect(screen.getByText("Room 101")).toBeInTheDocument();
  });

  it("removes a room's override from its row", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    await user.click(screen.getByRole("button", { name: "Remove override" }));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows zone_type as a read-only label and enabled as a switch", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: false }],
    });

    expect(screen.getByText("Office")).toBeInTheDocument();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("collapses and expands, showing the override count either way", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    expect(screen.getByText("1 overrides")).toBeInTheDocument();
    expect(screen.getByText("Room 101")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Collapse/ }));

    expect(screen.getByText("1 overrides")).toBeInTheDocument();
    expect(screen.queryByText("Room 101")).not.toBeInTheDocument();
  });
});
