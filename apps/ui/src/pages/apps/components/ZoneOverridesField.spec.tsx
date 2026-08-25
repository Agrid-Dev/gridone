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
    "zoneOverrides.searchPlaceholder": "Search zones",
    "zoneOverrides.empty": "No zone has an override yet.",
    "zoneOverrides.noResults": "No override matches this search.",
    "zoneOverrides.add": "Add override",
    "zoneOverrides.noneAvailable": "No piloted zone available",
    "zoneOverrides.remove": "Remove override",
    "zoneOverrides.copy": "Copy to other zones",
    "zoneOverrides.copyConfirm": "Copy to {{count}} zones",
    "zoneOverrides.columns.zone": "Zone",
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
      zone_type: { type: "string", default: "room" },
      comfort: { type: "number" },
      enabled: { type: "boolean", default: true },
    },
  },
};

function Harness({
  defaultValues,
  name = "zone_overrides",
  fieldSchema = schema,
}: {
  defaultValues: FieldValues;
  name?: string;
  fieldSchema?: AppSchemaNode;
}) {
  const { control } = useForm<FieldValues>({ defaultValues });
  return (
    <ZoneOverridesField
      name={name}
      schema={fieldSchema}
      control={control}
      required={false}
    />
  );
}

function renderField(
  defaultValues: FieldValues,
  options: { name?: string; fieldSchema?: AppSchemaNode } = {},
) {
  render(<Harness defaultValues={defaultValues} {...options} />);
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
    // One header row + one override row, regardless of what a row's own
    // "copy to rooms" picker also renders inside the table.
    expect(table.getAllByRole("row")).toHaveLength(2);
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

    await user.type(screen.getByPlaceholderText("Search zones"), "101");

    expect(screen.getByText("Room 101")).toBeInTheDocument();
    expect(screen.queryByText("Room 102")).not.toBeInTheDocument();
  });

  it("shows a no-results message when the search matches no override", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    await user.type(screen.getByPlaceholderText("Search zones"), "nope");

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

    // Scoped to the toolbar (above the table): a row's own copy-to-rooms
    // picker renders the same candidate set inside the table.
    const toolbar = screen.getByPlaceholderText("Search zones").parentElement!;
    const options = within(toolbar).getAllByRole("option");
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

  it("shows zone_type as an editable cell and enabled as a switch", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: false }],
    });

    const zoneType = screen.getByDisplayValue("office");
    await user.clear(zoneType);
    await user.type(zoneType, "suite");
    expect(zoneType).toHaveValue("suite");

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("resolves the piloted-zones sibling relative to its own field path", () => {
    renderField(
      {
        config: {
          piloted_zones: ["z1", "z2"],
          zone_overrides: [
            { zone_id: "z1", zone_type: "office", enabled: true },
          ],
        },
      },
      { name: "config.zone_overrides" },
    );

    // z2 is the only piloted room without an override; finding it proves the
    // sibling lookup followed the `config.` prefix rather than the root.
    // Scoped to the toolbar: a row's own copy-to-rooms picker renders the
    // same candidate set inside the table.
    const toolbar = screen.getByPlaceholderText("Search zones").parentElement!;
    const options = within(toolbar).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(within(options[0]).getByText("Room 102")).toBeInTheDocument();
  });

  it("surfaces a property the form dialect can't render instead of degrading it to a text input", () => {
    renderField(
      {
        piloted_zones: ["z1"],
        zone_overrides: [{ zone_id: "z1", schedule: { mon: "08:00" } }],
      },
      {
        fieldSchema: {
          type: "array",
          title: "Zone overrides",
          items: {
            type: "object",
            properties: {
              zone_id: { type: "string", format: "asset-id" },
              schedule: { type: "object" },
              enabled: { type: "boolean", default: true },
            },
          },
        },
      },
    );

    expect(screen.getByText("schemaForm.unsupportedField")).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("[object Object]"),
    ).not.toBeInTheDocument();
  });

  it("copies an override's values to selected rooms as independent rows", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1", "z2", "z3"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    const copyCell = screen
      .getByRole("button", { name: "Copy to other zones" })
      .closest("td")!;
    await user.click(within(copyCell).getByText("Room 102"));
    await user.click(within(copyCell).getByText("Room 103"));
    await user.click(
      within(copyCell).getByRole("button", { name: "Copy to 2 zones" }),
    );

    const table = within(screen.getByRole("table"));
    expect(table.getByText("Room 101")).toBeInTheDocument();
    expect(table.getByText("Room 102")).toBeInTheDocument();
    expect(table.getByText("Room 103")).toBeInTheDocument();
    const switches = table.getAllByRole("switch");
    expect(switches).toHaveLength(3);
    expect(
      switches.every((s) => s.getAttribute("aria-checked") === "true"),
    ).toBe(true);

    // Independence: flipping the copy doesn't affect the source or the other copy.
    await user.click(switches[1]);
    expect(switches[0]).toHaveAttribute("aria-checked", "true");
    expect(switches[1]).toHaveAttribute("aria-checked", "false");
    expect(switches[2]).toHaveAttribute("aria-checked", "true");
  });

  it("does not copy zone_type onto the target — it gets the schema default", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1", "z2"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    const copyCell = screen
      .getByRole("button", { name: "Copy to other zones" })
      .closest("td")!;
    await user.click(within(copyCell).getByText("Room 102"));
    await user.click(
      within(copyCell).getByRole("button", { name: "Copy to 1 zones" }),
    );

    // zone_type describes the room itself, not a copyable setting — the
    // source keeps "office", the copy gets the schema default ("room").
    expect(screen.getByDisplayValue("office")).toBeInTheDocument();
    expect(screen.getByDisplayValue("room")).toBeInTheDocument();
  });

  it("does not offer an already-overridden room as a copy target", () => {
    renderField({
      piloted_zones: ["z1", "z2"],
      zone_overrides: [
        { zone_id: "z1", zone_type: "office", enabled: true },
        { zone_id: "z2", zone_type: "office", enabled: true },
      ],
    });

    const copyCell = screen
      .getAllByRole("button", { name: "Copy to other zones" })[0]
      .closest("td")!;
    expect(
      within(copyCell).getByText("No piloted zone available"),
    ).toBeInTheDocument();
  });

  it("excludes a room from copy targets once it has just been copied to", async () => {
    const user = userEvent.setup();
    renderField({
      piloted_zones: ["z1", "z2", "z3"],
      zone_overrides: [{ zone_id: "z1", zone_type: "office", enabled: true }],
    });

    const copyCell = screen
      .getByRole("button", { name: "Copy to other zones" })
      .closest("td")!;
    await user.click(within(copyCell).getByText("Room 102"));
    await user.click(
      within(copyCell).getByRole("button", { name: "Copy to 1 zones" }),
    );

    // Room 102 is now overridden — the source row's copy picker must no
    // longer offer it, only the still-un-overridden Room 103.
    const copyCellAfter = screen
      .getAllByRole("button", { name: "Copy to other zones" })[0]
      .closest("td")!;
    expect(
      within(copyCellAfter).queryByText("Room 102"),
    ).not.toBeInTheDocument();
    expect(within(copyCellAfter).getByText("Room 103")).toBeInTheDocument();
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
