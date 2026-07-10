import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  type RenderResult,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TooltipProvider } from "@/components/ui";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceAttributePanes } from "./DeviceAttributePanes";
import type { Device } from "@gridone/sdk";
import type { DeviceAttribute } from "@/lib/devices";
import type { AttributeFields, FaultAttribute } from "@/lib/faults";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.panes.standard": "Attributes",
    "deviceDetails.panes.faults": "Faults",
    "deviceDetails.panes.internal": "Internal",
    "deviceDetails.attributeDetails.type": "Type",
    "deviceDetails.attributeDetails.access": "Access",
    "deviceDetails.attributeDetails.readOnly": "Read-only",
    "deviceDetails.attributeDetails.readWrite": "Read-write",
    "deviceDetails.attributeDetails.synced": "Synced",
    "deviceDetails.attributeDetails.changed": "Changed",
    "deviceDetails.attributeDetails.action": "click to command",
    "deviceDetails.connectionStatus.ok": "Connected",
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
  }),
);

const NOW = "2026-04-22T10:00:00Z";

const attr = (
  over: Partial<AttributeFields> & { name: string },
): AttributeFields => ({
  kind: "standard",
  data_type: "float",
  read_write_modes: ["read"],
  current_value: 21.5,
  last_updated: "2026-04-22T09:58:00Z", // 2m ago
  last_changed: "2026-04-22T09:00:00Z", // 1h ago
  ...over,
});

const faultAttr = (
  over: Partial<FaultAttribute> & {
    name: string;
    severity: FaultAttribute["severity"];
    is_faulty: boolean;
  },
): FaultAttribute => ({
  kind: "fault",
  data_type: "bool",
  read_write_modes: ["read"],
  current_value: true,
  last_updated: "2026-04-22T09:55:00Z",
  last_changed: "2026-04-22T09:55:00Z", // 5m ago
  ...over,
});

function makeDevice(attributes: Record<string, DeviceAttribute>): Device {
  return {
    id: "d1",
    name: "Device 1",
    type: null,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes,
    is_faulty: false,
  };
}

const renderPanes = (device: Device): RenderResult =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <DeviceAttributePanes device={device} />
      </TooltipProvider>
    </MemoryRouter>,
  );

const rowFor = (label: string): HTMLElement =>
  screen.getByText(label).closest("[data-attribute]") as HTMLElement;

beforeEach(() => {
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DeviceAttributePanes", () => {
  it("renders only non-empty panes, ordered Attributes · Faults · Internal", () => {
    renderPanes(
      makeDevice({
        temperature: attr({ name: "temperature" }),
        high_temp_alarm: faultAttr({
          name: "high_temp_alarm",
          severity: "alert",
          is_faulty: true,
        }),
        connection_status: attr({
          name: "connection_status",
          kind: "internal",
          data_type: "str",
          current_value: "ok",
        }),
      }),
    );

    const titles = screen.getAllByText(/^(Attributes|Faults|Internal)$/);
    expect(titles.map((el) => el.textContent)).toEqual([
      "Attributes",
      "Faults",
      "Internal",
    ]);
  });

  it("hides a pane with no rows", () => {
    renderPanes(makeDevice({ temperature: attr({ name: "temperature" }) }));

    expect(screen.getByText("Attributes")).toBeInTheDocument();
    expect(screen.queryByText("Faults")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal")).not.toBeInTheDocument();
  });

  it("shows name + value with a last-change indicator, keeping type/access off the row", () => {
    renderPanes(
      makeDevice({
        temperature: attr({ name: "temperature", current_value: 21.5 }),
      }),
    );

    const row = rowFor("Temperature");
    expect(within(row).getByText("21.50")).toBeInTheDocument();
    expect(within(row).getByText("1h")).toBeInTheDocument(); // last changed

    // Type, access mode and the sync time are details — not first-class on the row.
    expect(screen.queryByText("float")).not.toBeInTheDocument();
    expect(screen.queryByText("Access")).not.toBeInTheDocument();
    expect(screen.queryByText("2m")).not.toBeInTheDocument();
  });

  it("renders faulty rows distinctly with a severity chip", () => {
    renderPanes(
      makeDevice({
        alarm: faultAttr({
          name: "high_temp_alarm",
          severity: "alert",
          is_faulty: true,
        }),
      }),
    );

    const row = rowFor("High Temp Alarm");
    expect(row).toHaveAttribute("data-faulty");
    expect(within(row).getByText("alert")).toBeInTheDocument();
  });

  it("renders connection status as a green value when OK", () => {
    renderPanes(
      makeDevice({
        connection_status: attr({
          name: "connection_status",
          kind: "internal",
          data_type: "str",
          current_value: "ok",
        }),
      }),
    );

    expect(screen.getByText("Internal")).toBeInTheDocument();
    const value = within(rowFor("Connection Status")).getByText("Connected");
    expect(value).toHaveClass("text-status-ok");
  });

  it("links writable rows to the command form pre-targeted to the attribute", () => {
    renderPanes(
      makeDevice({
        setpoint: attr({
          name: "setpoint",
          read_write_modes: ["read", "write"],
        }),
      }),
    );

    const row = rowFor("Setpoint");
    expect(row.tagName).toBe("A");
    expect(row).toHaveAttribute(
      "href",
      "/devices/d1/commands/new?attribute=setpoint",
    );
  });

  it("does not link read-only rows", () => {
    renderPanes(makeDevice({ temperature: attr({ name: "temperature" }) }));
    expect(rowFor("Temperature").tagName).toBe("DIV");
  });
});
