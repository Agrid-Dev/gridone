import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceCombobox } from "./DeviceCombobox";

const { status } = vi.hoisted(() => ({ status: { visible: false } }));

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.device.label": "Device",
    "editor.device.none": "No device",
    "editor.device.search": "Search a device",
    "editor.device.empty": "No device matches.",
  }),
);
vi.mock("@/hooks/useCanSeeConnectionStatus", () => ({
  useCanSeeConnectionStatus: () => status.visible,
}));

afterEach(() => {
  cleanup();
  status.visible = false;
});

const DEVICES = [
  { id: "pac-1", name: "PAC 01", type: "heat_pump", attributes: {} },
  { id: "probe-1", name: "Sonde ECS", type: "sensor", attributes: {} },
] as unknown as Device[];

function renderCombobox(value: string | null) {
  const onChange = vi.fn();
  render(
    <DeviceCombobox value={value} devices={DEVICES} onChange={onChange} />,
  );
  return onChange;
}

const trigger = () => screen.getByRole("combobox", { name: "Device" });

describe("DeviceCombobox", () => {
  it("names the device the symbol stands for, or says it has none", () => {
    renderCombobox("pac-1");
    expect(trigger()).toHaveTextContent("PAC 01");
    cleanup();
    renderCombobox(null);
    expect(trigger()).toHaveTextContent("No device");
  });

  it("shows the id of a device the site no longer lists", () => {
    renderCombobox("gone-7");
    // Mutant: "No device" here hides a binding that still names one.
    expect(trigger()).toHaveTextContent("gone-7");
  });

  it("picks a device and closes", async () => {
    const user = userEvent.setup();
    const onChange = renderCombobox(null);
    await user.click(trigger());
    await user.click(screen.getByRole("option", { name: /Sonde ECS/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("probe-1");
    expect(screen.queryByRole("option", { name: /Sonde ECS/ })).toBeNull();
  });

  it("clears the device from its first row", async () => {
    const user = userEvent.setup();
    const onChange = renderCombobox("pac-1");
    await user.click(trigger());
    await user.click(screen.getByRole("option", { name: "No device" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("finds a device by its type as well as its name", async () => {
    const user = userEvent.setup();
    renderCombobox(null);
    await user.click(trigger());
    fireEvent.change(screen.getByPlaceholderText("Search a device"), {
      target: { value: "sensor" },
    });
    expect(
      screen
        .getAllByRole("option")
        .map((o) => o.getAttribute("data-device-option")),
    ).toEqual(["probe-1"]);
  });
});
