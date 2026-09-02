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
    "weeklySchedule.count": "{{count}} rooms",
    "weeklySchedule.expand": "Expand",
    "weeklySchedule.collapse": "Collapse",
    "weeklySchedule.searchPlaceholder": "Search rooms",
    "weeklySchedule.empty": "No room has a custom schedule yet.",
    "weeklySchedule.noResults": "No room matches this search.",
    "weeklySchedule.add": "Add room schedule",
    "weeklySchedule.noneAvailable": "No room available",
    "weeklySchedule.remove": "Remove room schedule",
    "weeklySchedule.addWindow": "Add window",
    "weeklySchedule.removeWindow": "Remove window",
    "weeklySchedule.usesDefault": "Uses default ({{checkin}}–{{checkout}})",
    "weeklySchedule.overlapWarning": "These windows overlap",
    "weeklySchedule.notOvernightWarning": "This window is ignored",
    "weeklySchedule.checkin": "Check-in",
    "weeklySchedule.checkout": "Check-out",
    "weeklySchedule.windowSeparator": "–",
    "weeklySchedule.columns.room": "Room",
    "weeklySchedule.days.monday": "Monday",
    "weeklySchedule.days.tuesday": "Tuesday",
    "weeklySchedule.days.wednesday": "Wednesday",
    "weeklySchedule.days.thursday": "Thursday",
    "weeklySchedule.days.friday": "Friday",
    "weeklySchedule.days.saturday": "Saturday",
    "weeklySchedule.days.sunday": "Sunday",
  }),
);

const assets: Asset[] = [
  { id: "z1", type: "zone", name: "Room 101", path: ["z1"], position: 0 },
  { id: "z2", type: "zone", name: "Room 102", path: ["z2"], position: 1 },
  { id: "z3", type: "zone", name: "Room 103", path: ["z3"], position: 2 },
  { id: "b1", type: "building", name: "Building A", path: ["b1"], position: 3 },
  { id: "f1", type: "floor", name: "Floor 1", path: ["b1", "f1"], position: 4 },
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

import { WeeklyScheduleField } from "./WeeklyScheduleField";

const schema: AppSchemaNode = {
  type: "array",
  title: "Per-day schedule",
  items: {
    type: "object",
    properties: {
      zone_id: { type: "string", format: "asset-id" },
      day_of_week: {
        type: "string",
        enum: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      },
      checkin_time: { type: "string" },
      checkout_time: { type: "string" },
    },
  },
};

function Harness({
  defaultValues,
  name = "weekly_schedule",
}: {
  defaultValues: FieldValues;
  name?: string;
}) {
  const { control } = useForm<FieldValues>({ defaultValues });
  return (
    <WeeklyScheduleField
      name={name}
      schema={schema}
      control={control}
      required={false}
    />
  );
}

function renderField(
  defaultValues: FieldValues,
  options: { name?: string } = {},
) {
  render(<Harness defaultValues={defaultValues} {...options} />);
}

afterEach(cleanup);

describe("WeeklyScheduleField", () => {
  it("renders one row per room, not per room-day", () => {
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
        {
          zone_id: "z1",
          day_of_week: "tuesday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    const table = within(screen.getByRole("table"));
    expect(table.getByText("Room 101")).toBeInTheDocument();
    // One header row + one room row (days render only once expanded).
    expect(table.getAllByRole("row")).toHaveLength(2);
  });

  it("shows all 7 days when a room's row is expanded, using default text for uncustomized days", async () => {
    const user = userEvent.setup();
    renderField({
      checkin_time: "15:00",
      checkout_time: "12:00",
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
    // Tuesday has no row of its own: falls back to the hotel default.
    const tuesday = screen.getByText("Tuesday").closest("div")!.parentElement!;
    expect(
      within(tuesday).getByText("Uses default (15:00–12:00)"),
    ).toBeInTheDocument();
  });

  it("resolves the default from the room's zone_overrides value over the hotel default", async () => {
    const user = userEvent.setup();
    renderField({
      checkin_time: "15:00",
      checkout_time: "12:00",
      zone_overrides: [
        { zone_id: "z1", checkin_time: "16:00", checkout_time: "10:00" },
      ],
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));

    const tuesday = screen.getByText("Tuesday").closest("div")!.parentElement!;
    expect(
      within(tuesday).getByText("Uses default (16:00–10:00)"),
    ).toBeInTheDocument();
  });

  it("toggling a day on adds a window prefilled with the resolved default", async () => {
    const user = userEvent.setup();
    renderField({
      checkin_time: "15:00",
      checkout_time: "12:00",
      weekly_schedule: [],
    });

    await user.click(screen.getByRole("option", { name: /Room 101/ }));
    await user.click(screen.getByRole("switch", { name: "Monday" }));

    const checkinInputs = screen.getAllByLabelText(
      "Check-in",
    ) as HTMLInputElement[];
    const checkoutInputs = screen.getAllByLabelText(
      "Check-out",
    ) as HTMLInputElement[];
    expect(checkinInputs[0].value).toBe("15:00");
    expect(checkoutInputs[0].value).toBe("12:00");
  });

  it("toggling a day off removes all of that day's windows", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));
    await user.click(screen.getByRole("switch", { name: "Monday" }));

    // All 7 days now fall back to the (unset) hotel default.
    expect(screen.getAllByText("Uses default (15:00–12:00)")).toHaveLength(7);
  });

  it("adds another window to a customized day", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));
    await user.click(screen.getByRole("button", { name: "Add window" }));

    expect(screen.getAllByLabelText("Check-in")).toHaveLength(2);
  });

  it("removing a day's last window reverts it to uncustomized", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));
    await user.click(screen.getByRole("button", { name: "Remove window" }));

    // All 7 days now fall back to the (unset) hotel default.
    expect(screen.getAllByText("Uses default (15:00–12:00)")).toHaveLength(7);
    expect(screen.queryByLabelText("Check-in")).not.toBeInTheDocument();
  });

  it("flags overlapping windows on the same day", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "08:00",
        },
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "23:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByText("These windows overlap")).toBeInTheDocument();
  });

  it("does not flag non-overlapping windows on the same day", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "23:00",
        },
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "23:30",
          checkout_time: "06:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.queryByText("These windows overlap")).not.toBeInTheDocument();
  });

  it("flags a non-overnight window (checkout not earlier than checkin)", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "12:00",
          checkout_time: "14:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByText("This window is ignored")).toBeInTheDocument();
  });

  it("does not flag an overnight window as non-overnight", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(
      screen.queryByText("This window is ignored"),
    ).not.toBeInTheDocument();
  });

  it("offers rooms not yet in weekly_schedule in the add picker, including non-piloted rooms", () => {
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    const toolbar = screen.getByPlaceholderText("Search rooms").parentElement!;
    const options = within(toolbar).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(within(options[0]).getByText("Room 102")).toBeInTheDocument();
    expect(within(options[1]).getByText("Room 103")).toBeInTheDocument();
  });

  it("excludes buildings and floors from the add picker's candidates", () => {
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    const toolbar = screen.getByPlaceholderText("Search rooms").parentElement!;
    expect(within(toolbar).queryByText("Building A")).not.toBeInTheDocument();
    expect(within(toolbar).queryByText("Floor 1")).not.toBeInTheDocument();
  });

  it("adds a room to the table when picked, with no day customized yet", async () => {
    const user = userEvent.setup();
    renderField({ weekly_schedule: [] });

    await user.click(screen.getByRole("option", { name: /Room 101/ }));

    expect(screen.getByText("Room 101")).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    for (const day of ["Monday", "Sunday"]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
  });

  it("removes a room and clears all of its custom days", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
        {
          zone_id: "z1",
          day_of_week: "tuesday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.click(
      screen.getByRole("button", { name: "Remove room schedule" }),
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("filters visible rooms by name", async () => {
    const user = userEvent.setup();
    renderField({
      weekly_schedule: [
        {
          zone_id: "z1",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
        {
          zone_id: "z2",
          day_of_week: "monday",
          checkin_time: "22:00",
          checkout_time: "07:00",
        },
      ],
    });

    await user.type(screen.getByPlaceholderText("Search rooms"), "101");

    expect(screen.getByText("Room 101")).toBeInTheDocument();
    expect(screen.queryByText("Room 102")).not.toBeInTheDocument();
  });
});
