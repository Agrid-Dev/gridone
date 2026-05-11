import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceDiscoverySwitch } from "./DeviceDiscoverySwitch";

vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.fields.discoverDevicesLikeMe": "Discover devices like me",
    "devices.fields.discoverDevicesLikeMeHelp":
      "Listen on this network and auto-import devices that match this driver.",
  }),
);

afterEach(() => cleanup());

describe("DeviceDiscoverySwitch", () => {
  it("renders label and help text", () => {
    render(
      <DeviceDiscoverySwitch checked={false} onCheckedChange={() => {}} />,
    );
    expect(screen.getByText("Discover devices like me")).toBeInTheDocument();
    expect(
      screen.getByText(/Listen on this network and auto-import/),
    ).toBeInTheDocument();
  });

  it("reflects the `checked` prop on the switch", () => {
    const { rerender } = render(
      <DeviceDiscoverySwitch checked={false} onCheckedChange={() => {}} />,
    );
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    rerender(
      <DeviceDiscoverySwitch checked={true} onCheckedChange={() => {}} />,
    );
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("calls onCheckedChange when toggled", () => {
    const onCheckedChange = vi.fn();
    render(
      <DeviceDiscoverySwitch
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("disables interaction while loading", () => {
    const onCheckedChange = vi.fn();
    render(
      <DeviceDiscoverySwitch
        checked={false}
        onCheckedChange={onCheckedChange}
        loading
      />,
    );
    const sw = screen.getByRole("switch");
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
