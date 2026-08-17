import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "commands.new.targetMode.devices": "Specific devices",
    "commands.new.targetMode.filters": "By filter",
    "commands.new.summary.deviceCount": "{{count}} devices",
    "commands.new.filterPreviewHint": "Re-resolved at each dispatch.",
    "commands.new.noDevicesMatch": "No devices match your filter.",
    "commands.new.selectionCount": "{{count}} of {{total}} selected",
    "commands.new.searchDevicesPlaceholder": "Search devices",
    "common:common.clear": "Clear",
  }),
);

import { DevicesFilterTabs } from "./DevicesFilterTabs";

afterEach(cleanup);

function device(id: string, tags: Record<string, string> = {}): Device {
  return { id, name: id, tags } as Device;
}

const devices: Device[] = [
  device("d1", { floor: "1", zone: "north" }),
  device("d2", { floor: "1", zone: "south" }),
  device("d3", { floor: "2", zone: "north" }),
];

describe("DevicesFilterTabs — filters mode tags", () => {
  it("offers a chip per observed tag value and matches devices by intersection across keys", () => {
    const onTagsFilterChange = vi.fn();
    render(
      <DevicesFilterTabs
        devices={devices}
        mode="filters"
        onModeChange={vi.fn()}
        deviceIds={[]}
        onDeviceIdsChange={vi.fn()}
        onTypesFilterChange={vi.fn()}
        tagsFilter={{ floor: ["1"] }}
        onTagsFilterChange={onTagsFilterChange}
      />,
    );

    // Only devices tagged floor=1 count toward the live match total.
    expect(screen.getByText("2 devices")).toBeInTheDocument();
    expect(screen.getByText("d1")).toBeInTheDocument();
    expect(screen.getByText("d2")).toBeInTheDocument();
    expect(screen.queryByText("d3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "north" }));
    expect(onTagsFilterChange).toHaveBeenCalledWith({
      floor: ["1"],
      zone: ["north"],
    });
  });

  it("clears both types and tags from a single control", () => {
    const onTypesFilterChange = vi.fn();
    const onTagsFilterChange = vi.fn();
    render(
      <DevicesFilterTabs
        devices={devices}
        mode="filters"
        onModeChange={vi.fn()}
        deviceIds={[]}
        onDeviceIdsChange={vi.fn()}
        typesFilter={["thermostat"]}
        onTypesFilterChange={onTypesFilterChange}
        tagsFilter={{ floor: ["1"] }}
        onTagsFilterChange={onTagsFilterChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onTypesFilterChange).toHaveBeenCalledWith(undefined);
    expect(onTagsFilterChange).toHaveBeenCalledWith(undefined);
  });

  it("hides tag chips entirely when the caller has not adopted tag filtering", () => {
    render(
      <DevicesFilterTabs
        devices={devices}
        mode="filters"
        onModeChange={vi.fn()}
        deviceIds={[]}
        onDeviceIdsChange={vi.fn()}
        onTypesFilterChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "north" }),
    ).not.toBeInTheDocument();
    // No criteria at all — an empty filter matches nothing.
    expect(screen.getByText("0 devices")).toBeInTheDocument();
  });
});
