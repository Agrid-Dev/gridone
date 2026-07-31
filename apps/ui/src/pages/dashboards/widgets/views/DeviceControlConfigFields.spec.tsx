import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm, type FieldValues } from "react-hook-form";
import type { Device } from "@gridone/sdk";

const picked = { id: "dev1", name: "Thermostat hall" } as Device;
vi.mock("@/components/forms/resourcePickers/DevicePicker", () => ({
  default: ({
    value,
    onSelect,
  }: {
    value: string | undefined;
    onSelect: (device: Device | null) => void;
  }) => (
    <button data-value={value ?? ""} onClick={() => onSelect(picked)}>
      pick
    </button>
  ),
}));

// Imported after the mocks are registered.
import { DeviceControlConfigFields } from "./DeviceControlConfigFields";

function Harness({ onChange }: { onChange: (values: FieldValues) => void }) {
  const { control, watch } = useForm<FieldValues>({
    defaultValues: { config: { device_id: "" } },
  });
  onChange(watch());
  return <DeviceControlConfigFields control={control} />;
}

afterEach(cleanup);

describe("DeviceControlConfigFields", () => {
  it("writes the picked device's id to config.device_id", () => {
    let values: FieldValues = {};
    render(<Harness onChange={(v) => (values = v)} />);

    expect(screen.getByRole("button")).toHaveAttribute("data-value", "");
    fireEvent.click(screen.getByRole("button"));

    expect(values.config.device_id).toBe("dev1");
  });
});
